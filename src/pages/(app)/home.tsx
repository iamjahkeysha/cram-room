import { useEffect, useMemo, useState } from 'react'
import { getAuthToken, useQuery } from 'deepspace'

const QUESTION_SECONDS = 20
const REVEAL_SECONDS = 6
const COLORS = ['#4f46e5', '#db2777', '#059669', '#d97706', '#0891b2', '#7c3aed', '#dc2626', '#65a30d']

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
type Answer = { roomId: string; userId: string; questionIndex: number; choice: number; correct: boolean; first: boolean; points: number }

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function callAction<T>(name: string, body: object): Promise<Result<T>> {
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuthToken()}` },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    return json.success ? { ok: true, data: json.data } : { ok: false, error: json.error ?? `Request failed (${res.status})` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

function readName(): string {
  try { return localStorage.getItem('cram:name') ?? '' } catch { return '' }
}
function saveName(name: string) {
  try { localStorage.setItem('cram:name', name) } catch { /* storage unavailable */ }
}

// A stable color per player, picked from their id so it never changes mid-game.
function colorFor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

const plain = (s: string) => s.replace(/\*\*|__|(?<!\w)[*_]|[*_](?!\w)/g, '')

const styles = {
  page: { maxWidth: 720, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'system-ui, sans-serif' },
  card: { border: '1px solid #8884', borderRadius: 12, padding: 16, marginTop: 16 },
  input: { display: 'block', width: '100%', padding: 10, marginTop: 8, borderRadius: 8, border: '1px solid #8886', boxSizing: 'border-box' as const },
  button: { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 600, cursor: 'pointer', marginTop: 12 },
  ghost: { padding: '10px 18px', borderRadius: 8, border: '1px solid #8886', background: 'transparent', color: 'inherit', cursor: 'pointer', marginTop: 12 },
  error: { color: '#dc2626', marginTop: 8 },
  muted: { opacity: 0.7, fontSize: 14 },
}

function useRoomParam() {
  const read = () => (new URLSearchParams(window.location.search).get('room') ?? '').toUpperCase()
  const [room, setRoom] = useState(read)
  useEffect(() => {
    const onPop = () => setRoom(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const go = (id: string) => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('room', id)
    else url.searchParams.delete('room')
    window.history.pushState(null, '', url)
    setRoom(id)
  }
  return [room, go] as const
}

export default function Home() {
  const [roomId, goToRoom] = useRoomParam()
  return (
    <div style={styles.page}>
      <h1 style={{ marginBottom: 0 }}>Cram Room</h1>
      <p style={styles.muted}>Turn any article or notes into a live quiz, with every answer backed by the source.</p>
      {roomId ? <RoomView code={roomId} onLeave={() => goToRoom('')} /> : <StartScreen onEnter={goToRoom} />}
    </div>
  )
}

function StartScreen({ onEnter }: { onEnter: (id: string) => void }) {
  const [name, setName] = useState(readName)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true); setError(null); saveName(name)
    const r = await callAction<{ roomId: string }>('createRoom', url.trim() ? { url: url.trim(), name } : { text, name })
    setBusy(false)
    if (r.ok) onEnter(r.data.roomId)
    else setError(r.error)
  }

  async function join() {
    setBusy(true); setError(null); saveName(name)
    const r = await callAction<{ roomId: string }>('joinRoom', { roomId: code, name })
    setBusy(false)
    if (r.ok) onEnter(r.data.roomId)
    else setError(r.error)
  }

  return (
    <>
      <div style={styles.card}>
        <label>Your name
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" maxLength={24} />
        </label>
      </div>

      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Host a quiz</h2>
        <input style={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Article link (https://...)" />
        <textarea style={styles.input} rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="...or paste your notes (used when the link is empty)" />
        <button style={styles.button} disabled={busy || (!url.trim() && !text.trim())} onClick={create}>
          {busy ? 'Writing questions… (10–20s)' : 'Create room'}
        </button>
      </div>

      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Join a quiz</h2>
        <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Room code" maxLength={6} />
        <button style={styles.ghost} disabled={busy || code.trim().length < 6} onClick={join}>Join room</button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
    </>
  )
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [active])
  return now
}

function RoomView({ code, onLeave }: { code: string; onLeave: () => void }) {
  const rooms = useQuery<Room>('rooms', { where: { code } })
  const players = useQuery<Player>('players', { where: { roomId: code } })
  const answers = useQuery<Answer>('answers', { where: { roomId: code } })

  const [myId, setMyId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Joining is idempotent, so re-entering a room (or refreshing) just returns your id.
  useEffect(() => {
    let cancelled = false
    callAction<{ userId: string }>('joinRoom', { roomId: code, name: readName() }).then((r) => {
      if (cancelled) return
      if (r.ok) setMyId(r.data.userId)
      else setJoinError(r.error)
    })
    return () => { cancelled = true }
  }, [code])

  const room = rooms.records[0]?.data
  const status = room?.status
  const index = room?.currentIndex ?? -1
  const now = useNow(status === 'question' || status === 'reveal')

  // Only ever use this player's own answers, even if more were visible.
  const myAnswers = useMemo(
    () => answers.records.map((a) => a.data).filter((a) => a.userId === myId),
    [answers.records, myId],
  )
  const playerList = useMemo(() => players.records.map((p) => p.data), [players.records])
  const everyoneAnswered = playerList.length > 0 && playerList.every((p) => p.answeredIndex === index)

  // Auto-advance: when time is up (or everyone answered), ask the server to move on.
  // The server checks its own clock, so early or repeated calls are harmless.
  const due = !!room && myId !== null && (
    status === 'question'
      ? now >= room.questionStartedAt + QUESTION_SECONDS * 1000 || everyoneAnswered
      : status === 'reveal'
        ? now >= room.revealedAt + REVEAL_SECONDS * 1000
        : false
  )
  useEffect(() => {
    if (!due) return
    callAction('advance', { roomId: code })
    const t = setInterval(() => callAction('advance', { roomId: code }), 1500)
    return () => clearInterval(t)
  }, [due, code, status, index])

  if (joinError) {
    return (
      <div style={styles.card}>
        <p style={styles.error}>{joinError}</p>
        <button style={styles.ghost} onClick={onLeave}>Back</button>
      </div>
    )
  }
  if (!room || !myId) return <div style={styles.card}>Loading room…</div>

  const isHost = room.hostId === myId
  const question = room.questions[index]
  const myAnswer = myAnswers.find((a) => a.questionIndex === index)
  const answeredCount = playerList.filter((p) => p.answeredIndex === index).length
  const secondsLeft = Math.max(0, Math.ceil((room.questionStartedAt + QUESTION_SECONDS * 1000 - now) / 1000))
  const nextIn = Math.max(0, Math.ceil((room.revealedAt + REVEAL_SECONDS * 1000 - now) / 1000))
  const shareLink = `${window.location.origin}/home?room=${code}`

  async function start() {
    setBusy(true); setActionError(null)
    const r = await callAction('startGame', { roomId: code })
    setBusy(false)
    if (!r.ok) setActionError(r.error)
  }

  return (
    <>
      <div style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={styles.muted}>Room code</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>{code}</div>
          <div style={styles.muted}>Source: {room.sourceLabel}</div>
        </div>
        <button style={styles.ghost} onClick={onLeave}>Leave</button>
      </div>

      {room.status !== 'lobby' && (
        <Scoreboard players={playerList} myId={myId} index={index} showAnswered={room.status === 'question'} />
      )}

      {room.status === 'lobby' && (
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Waiting for players</h2>
          <p>Share this link, or have friends enter the code:</p>
          <input style={styles.input} readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {playerList.map((p) => (
              <span key={p.userId} style={{ padding: '4px 10px', borderRadius: 999, background: colorFor(p.userId), color: 'white', fontWeight: 600 }}>
                {p.name}
              </span>
            ))}
          </div>
          {isHost
            ? <button style={styles.button} disabled={busy} onClick={start}>Start quiz ({room.questions.length} questions)</button>
            : <p style={styles.muted}>The host will start the quiz.</p>}
        </div>
      )}

      {(room.status === 'question' || room.status === 'reveal') && question && (
        <QuestionCard
          room={room}
          index={index}
          question={question}
          myAnswer={myAnswer}
          secondsLeft={secondsLeft}
          nextIn={nextIn}
          answeredCount={answeredCount}
          playerCount={playerList.length}
          onAnswer={async (choice) => {
            setActionError(null)
            const r = await callAction('submitAnswer', { roomId: code, choice })
            if (!r.ok) setActionError(r.error)
          }}
        />
      )}

      {actionError && <p style={styles.error}>{actionError}</p>}

      {room.status === 'done' && <Review room={room} answers={myAnswers} />}
    </>
  )
}

function Scoreboard({ players, myId, index, showAnswered }: { players: Player[]; myId: string; index: number; showAnswered: boolean }) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const top = Math.max(1, ...sorted.map((p) => p.score))
  return (
    <div style={styles.card}>
      <div style={{ display: 'grid', gap: 8 }}>
        {sorted.map((p) => {
          const pct = Math.max(3, Math.round((p.score / top) * 100))
          const answered = showAnswered && p.answeredIndex === index
          return (
            <div key={p.userId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: p.userId === myId ? 700 : 500 }}>
                <span>{p.name}{p.userId === myId ? ' (you)' : ''} {answered ? '✓' : ''}</span>
                <span>{p.score}</span>
              </div>
              <div style={{ height: 12, borderRadius: 6, background: '#8882', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: colorFor(p.userId), transition: 'width 700ms ease' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QuestionCard(props: {
  room: Room
  index: number
  question: { question: string; choices: string[] }
  myAnswer?: Answer
  secondsLeft: number
  nextIn: number
  answeredCount: number
  playerCount: number
  onAnswer: (choice: number) => void
}) {
  const { room, index, question, myAnswer, secondsLeft, nextIn, answeredCount, playerCount, onAnswer } = props
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [index])

  const reveal = room.status === 'reveal' ? room.reveals[index] : null
  const chosen = myAnswer?.choice ?? picked
  const locked = chosen !== null || room.status !== 'question' || secondsLeft === 0
  const isLast = index + 1 >= room.questions.length

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...styles.muted }}>
        <span>Question {index + 1} of {room.questions.length}</span>
        {room.status === 'question'
          ? <span>{secondsLeft}s · {answeredCount}/{playerCount} answered</span>
          : <span>{isLast ? 'Results' : 'Next question'} in {nextIn}s</span>}
      </div>
      <h2>{question.question}</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {question.choices.map((c, i) => {
          const isCorrect = reveal && reveal.answerIndex === i
          const isWrongPick = reveal && chosen === i && reveal.answerIndex !== i
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => { setPicked(i); onAnswer(i) }}
              style={{
                textAlign: 'left', padding: 12, borderRadius: 8, cursor: locked ? 'default' : 'pointer',
                border: chosen === i ? '2px solid #4f46e5' : '1px solid #8886',
                background: isCorrect ? '#16a34a33' : isWrongPick ? '#dc262633' : 'transparent',
                color: 'inherit', fontSize: 16,
              }}
            >
              {c} {isCorrect ? '✓' : ''}
            </button>
          )
        })}
      </div>
      {room.status === 'question' && chosen !== null && <p style={styles.muted}>Answer locked in. Waiting for the reveal…</p>}
      {reveal && (
        <div style={{ marginTop: 16 }}>
          {myAnswer
            ? <p><strong>{myAnswer.correct ? `Correct! +${myAnswer.points}${myAnswer.first ? ' (first to answer correctly!)' : ''}` : 'Not this time.'}</strong></p>
            : <p><strong>No answer submitted.</strong></p>}
          <blockquote style={{ borderLeft: '3px solid #4f46e5', margin: 0, paddingLeft: 12 }}>“{plain(reveal.sourceQuote)}”</blockquote>
          <p style={styles.muted}>{reveal.explanation}</p>
        </div>
      )}
    </div>
  )
}

function Review({ room, answers }: { room: Room; answers: Answer[] }) {
  const missed = room.questions
    .map((q, i) => ({ q, i, reveal: room.reveals[i], mine: answers.find((a) => a.questionIndex === i) }))
    .filter((x) => !x.mine?.correct)

  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>What you missed</h3>
      {missed.length === 0 && <p>Perfect round. Nothing to review!</p>}
      {missed.map(({ q, i, reveal, mine }) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <strong>{q.question}</strong>
          <p style={{ margin: '4px 0' }}>
            Your answer: {mine ? q.choices[mine.choice] : 'none'} · Correct: {reveal ? q.choices[reveal.answerIndex] : '?'}
          </p>
          {reveal && <blockquote style={{ borderLeft: '3px solid #8886', margin: 0, paddingLeft: 12 }}>“{plain(reveal.sourceQuote)}”</blockquote>}
        </div>
      ))}
    </div>
  )
}
