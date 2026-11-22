// src/actions/roomActions.ts
// All game state changes happen here, on the server. The browser only sends
// requests like "start" or "my answer is 2"; these actions check who is asking
// and whether it's allowed, using the verified caller id.

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { generateQuestions, type Question } from './generateQuestions'

export const QUESTION_SECONDS = 20
export const REVEAL_SECONDS = 6
const GRACE_MS = 2000 // network delay allowance for answers near the buzzer
const FIRST_BONUS = 25 // tiny bonus for the first correct answer on each question
const MAX_ROOMS_PER_HOUR = 10 // every room costs the app owner credits

type Ctx = Parameters<ActionHandler<Env>>[0]
type Tools = Ctx['tools']

type Reveal = { answerIndex: number; sourceQuote: string; explanation: string }
type Room = {
  code: string
  hostId: string
  status: 'lobby' | 'question' | 'reveal' | 'done'
  currentIndex: number
  questionStartedAt: number
  revealedAt: number
  questions: { question: string; choices: string[] }[]
  reveals: (Reveal | null)[]
  sourceLabel: string
}
type Player = { roomId: string; userId: string; name: string; score: number; answeredIndex: number }
type Answer = { roomId: string; userId: string; questionIndex: number; points: number }

const fail = (error: string) => ({ success: false as const, error })
const ok = <T,>(data: T) => ({ success: true as const, data })

async function getData<T>(tools: Tools, coll: string, id: string): Promise<T | null> {
  const r = await tools.get(coll, id)
  if (!r.success) return null
  return ((r.data as { record?: { data?: T } })?.record?.data ?? null) as T | null
}

// tools.query results may or may not wrap fields in .data; handle both.
async function queryRows<T>(tools: Tools, coll: string, where: Record<string, string | number>): Promise<T[]> {
  const r = await tools.query(coll, { where })
  if (!r.success) return []
  const records = (r.data as { records?: Record<string, unknown>[] }).records ?? []
  return records.map((rec) => ((rec.data as T | undefined) ?? (rec as unknown as T)))
}

function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 24) : ''
  return s || 'Player'
}

function cleanCode(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase() : ''
}

function newCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

const playerId = (roomId: string, userId: string) => `${roomId}_${userId}`

export const createRoom: ActionHandler<Env> = async (ctx) => {
  const { tools, userId, params } = ctx

  // Spend control: limit how many rooms one person can create per hour.
  const mine = await tools.query('rooms', { where: { hostId: userId } })
  if (mine.success) {
    const hourAgo = Date.now() - 60 * 60 * 1000
    const records = (mine.data as { records: { createdAt?: string | number }[] }).records
    const recent = records.filter((r) => new Date(r.createdAt ?? 0).getTime() > hourAgo).length
    if (recent >= MAX_ROOMS_PER_HOUR) return fail('You have created a lot of rooms recently. Try again later.')
  }

  const generated = await generateQuestions(ctx)
  if (!generated.success) return generated
  const questions = (generated.data as { questions: Question[] }).questions

  const roomId = newCode()
  const url = typeof params.url === 'string' ? params.url.trim() : ''
  const sourceLabel = url ? url.replace(/^https?:\/\//, '').slice(0, 80) : 'Pasted notes'

  const secret = await tools.create('roomSecrets', { roomId, questions }, roomId)
  if (!secret.success) return fail('Could not save the quiz. Please try again.')

  const room = await tools.create(
    'rooms',
    {
      code: roomId,
      hostId: userId,
      status: 'lobby',
      currentIndex: -1,
      questionStartedAt: 0,
      revealedAt: 0,
      questions: questions.map((q) => ({ question: q.question, choices: q.choices })),
      reveals: questions.map(() => null),
      sourceLabel,
    },
    roomId,
  )
  if (!room.success) return fail('Could not create the room. Please try again.')

  await tools.create(
    'players',
    { roomId, userId, name: cleanName(params.name), score: 0, answeredIndex: -1 },
    playerId(roomId, userId),
  )
  return ok({ roomId, userId })
}

export const joinRoom: ActionHandler<Env> = async ({ params, tools, userId }) => {
  const roomId = cleanCode(params.roomId)
  const room = await getData<Room>(tools, 'rooms', roomId)
  if (!room) return fail('No room with that code.')

  const id = playerId(roomId, userId)
  const existing = await getData<Player>(tools, 'players', id)
  if (existing) {
    if (typeof params.name === 'string' && params.name.trim()) {
      await tools.update('players', id, { name: cleanName(params.name) })
    }
  } else {
    await tools.create('players', { roomId, userId, name: cleanName(params.name), score: 0, answeredIndex: -1 }, id)
  }
  return ok({ roomId, userId })
}

export const startGame: ActionHandler<Env> = async ({ params, tools, userId }) => {
  const roomId = cleanCode(params.roomId)
  const room = await getData<Room>(tools, 'rooms', roomId)
  if (!room) return fail('Room not found.')
  if (room.hostId !== userId) return fail('Only the host can start the quiz.')
  if (room.status !== 'lobby') return fail('The game has already started.')
  await tools.update('rooms', roomId, { status: 'question', currentIndex: 0, questionStartedAt: Date.now() })
  return ok({})
}

// Recompute every player's total from their saved answers, up to and including
// this question. Recomputing (instead of adding) means running it twice is harmless.
async function recomputeScores(tools: Tools, roomId: string, upToIndex: number) {
  const answers = await queryRows<Answer>(tools, 'answers', { roomId })
  const totals = new Map<string, number>()
  for (const a of answers) {
    if (Number(a.questionIndex) <= upToIndex) {
      totals.set(a.userId, (totals.get(a.userId) ?? 0) + (Number(a.points) || 0))
    }
  }
  const players = await queryRows<Player>(tools, 'players', { roomId })
  for (const p of players) {
    await tools.update('players', playerId(roomId, p.userId), { score: totals.get(p.userId) ?? 0 })
  }
}

// Any player in the room may call this. It only moves the game forward when the
// server's own clock (or everyone having answered) says it's time, so calling it
// early or many times does nothing harmful.
export const advance: ActionHandler<Env> = async ({ params, tools, userId }) => {
  const roomId = cleanCode(params.roomId)
  const room = await getData<Room>(tools, 'rooms', roomId)
  if (!room) return fail('Room not found.')
  if (!(await getData<Player>(tools, 'players', playerId(roomId, userId)))) return fail('Join the room first.')

  const now = Date.now()

  if (room.status === 'question') {
    const timeUp = now >= room.questionStartedAt + QUESTION_SECONDS * 1000 + GRACE_MS
    let everyoneAnswered = false
    if (!timeUp) {
      const players = await queryRows<Player>(tools, 'players', { roomId })
      everyoneAnswered = players.length > 0 && players.every((p) => Number(p.answeredIndex) === Number(room.currentIndex))
    }
    if (!timeUp && !everyoneAnswered) return ok({ advanced: false })

    const secret = await getData<{ questions: Question[] }>(tools, 'roomSecrets', roomId)
    const q = secret?.questions[room.currentIndex]
    if (!q) return fail('Quiz data is missing.')

    // Scores become visible only now, at the reveal, so nobody learns who was right early.
    await recomputeScores(tools, roomId, room.currentIndex)

    const reveals = [...room.reveals]
    reveals[room.currentIndex] = { answerIndex: q.answerIndex, sourceQuote: q.sourceQuote, explanation: q.explanation }
    await tools.update('rooms', roomId, { status: 'reveal', reveals, revealedAt: now })
    return ok({ advanced: true })
  }

  if (room.status === 'reveal') {
    if (now < room.revealedAt + REVEAL_SECONDS * 1000) return ok({ advanced: false })
    const next = room.currentIndex + 1
    if (next >= room.questions.length) {
      await tools.update('rooms', roomId, { status: 'done' })
    } else {
      await tools.update('rooms', roomId, { status: 'question', currentIndex: next, questionStartedAt: now })
    }
    return ok({ advanced: true })
  }

  return ok({ advanced: false })
}

export const submitAnswer: ActionHandler<Env> = async ({ params, tools, userId }) => {
  const roomId = cleanCode(params.roomId)
  const choice = params.choice
  if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice > 3) return fail('Invalid answer.')

  const room = await getData<Room>(tools, 'rooms', roomId)
  if (!room) return fail('Room not found.')
  if (room.status !== 'question') return fail('This question is closed.')

  const elapsed = Date.now() - room.questionStartedAt
  const limit = QUESTION_SECONDS * 1000
  if (elapsed > limit + GRACE_MS) return fail("Time's up for this question.")

  const pid = playerId(roomId, userId)
  const player = await getData<Player>(tools, 'players', pid)
  if (!player) return fail('Join the room first.')

  const index = room.currentIndex
  const secret = await getData<{ questions: Question[] }>(tools, 'roomSecrets', roomId)
  const q = secret?.questions[index]
  if (!q) return fail('Quiz data is missing.')

  const correct = q.answerIndex === choice
  const speed = Math.max(0, Math.min(1, 1 - elapsed / limit))
  let points = correct ? 500 + Math.round(500 * speed) : 0

  // Unique per player per question: a second submit fails here, so answers can't be changed.
  const answerId = `${roomId}_${index}_${userId}`
  const saved = await tools.create('answers', { roomId, userId, questionIndex: index, choice, correct, first: false, points }, answerId)
  if (!saved.success) return fail('You already answered this question.')

  // First correct answer on this question gets a tiny bonus. The firsts collection
  // allows only one row per question, so only one player can win this.
  if (correct) {
    const claim = await tools.create('firsts', { roomId, questionIndex: index, userId })
    if (claim.success) {
      points += FIRST_BONUS
      await tools.update('answers', answerId, { first: true, points })
    }
  }

  // Mark that this player answered (for the ✓), but don't touch the visible score
  // until the reveal.
  await tools.update('players', pid, { answeredIndex: index })
  return ok({ accepted: true })
}
