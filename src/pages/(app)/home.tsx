import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { getAuthToken, useQuery } from 'deepspace'
import { setLiveStatus } from '../../liveStatus'

const QUESTION_SECONDS = 20
const REVEAL_SECONDS = 6
const PLAYER_COLORS = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#f87171']
const CHOICE_COLORS = ['#e11d48', '#2563eb', '#ca8a04', '#16a34a']
const LETTERS = ['A', 'B', 'C', 'D']
const YELLOW = '#facc15'
const INK = '#1e0b3a'

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
  return PLAYER_COLORS[h % PLAYER_COLORS.length]
}

const plain = (s: string) => s.replace(/\*\*|__|(?<!\w)[*_]|[*_](?!\w)/g, '')

const groovy: CSSProperties = {
  fontFamily: "'Shrikhand', cursive", color: YELLOW, fontWeight: 400,
  textShadow: '2px 2px 0 #fb923c, 4px 4px 0 #f472b6, 6px 6px 0 #7c3aed',
}

const styles = {
  backdrop: { minHeight: '100%', background: 'linear-gradient(160deg, #1e0b3a 0%, #3b0764 55%, #4c1d95 100%)', color: '#f5f3ff' },
  page: { maxWidth: 720, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' },
  card: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 18, padding: 18, marginTop: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' },
  input: { display: 'block', width: '100%', padding: 12, marginTop: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, boxSizing: 'border-box' as const },
  button: { padding: '12px 22px', borderRadius: 12, border: 'none', background: YELLOW, color: INK, fontWeight: 800, fontSize: 16, cursor: 'pointer', marginTop: 14, boxShadow: '0 4px 0 #a16207' },
  ghost: { padding: '10px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer', marginTop: 12 },
  link: { background: 'none', border: 'none', color: YELLOW, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 14, marginTop: 10 },
  error: { color: '#fca5a5', marginTop: 8, fontWeight: 600 },
  muted: { opacity: 0.75, fontSize: 14 },
  h2: { marginTop: 0, fontWeight: 800 },
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
    else url.searchParams.delete('room'); url.searchParams.delete('join')
    window.history.pushState(null, '', url)
    setRoom(id)
  }
  return [room, go] as const
}

export default function Home() {
  const [roomId, goToRoom] = useRoomParam(); const joinMode = new URLSearchParams(window.location.search).has('join')
  return (
    <div style={styles.backdrop}>
      <div style={styles.page}>
        {roomId
          ? <NameGate onLeave={() => goToRoom('')}><RoomView code={roomId} onLeave={() => goToRoom('')} /></NameGate>
          : joinMode ? <JoinTicket onEnter={goToRoom} /> : <StartScreen onEnter={goToRoom} />}
      </div>
    </div>
  )
}

function StartScreen({ onEnter }: { onEnter: (id: string) => void }) {
  const [name, setName] = useState(readName)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [useNotes, setUseNotes] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreate = !busy && (useNotes ? text.trim().length > 0 : url.trim().length > 0)

  async function create() {
    setBusy(true); setError(null); saveName(name)
    const r = await callAction<{ roomId: string }>('createRoom', useNotes ? { text, name } : { url: url.trim(), name })
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

  const steps = [
    { n: '1', text: 'Paste an article link or your notes' },
    { n: '2', text: 'Friends join with a 6-letter code' },
    { n: '3', text: 'Every answer is backed by a quote from the source' },
  ]

  return (
    <>
      <h1 style={{ fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 900, lineHeight: 1.15, margin: '12px 0 8px' }}>
        <span style={{ ...groovy, display: 'block', textAlign: 'center', fontSize: 'clamp(38px, 8vw, 60px)', lineHeight: 1.05 }}>Study smarter,<br />together.</span>
      </h1>
      <p style={{ ...styles.muted, fontSize: 17, textAlign: 'center', maxWidth: 520, margin: '14px auto 0' }}>Your notes become a quiz show. Every answer comes with its source.</p>

      <div style={styles.card}>
        <label style={{ fontWeight: 700 }}>Your name
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" maxLength={24} />
        </label>

        <div style={{ marginTop: 14, fontWeight: 700 }}>{useNotes ? 'Your notes' : 'Article link'}</div>
        {useNotes
          ? <textarea style={styles.input} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a few paragraphs of notes…" />
          : <input style={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://en.wikipedia.org/wiki/…" />}
        <button style={styles.link} onClick={() => setUseNotes((v) => !v)}>
          {useNotes ? 'Use an article link instead' : 'Or paste your notes instead'}
        </button>
        <div>
          <button style={styles.button} disabled={!canCreate} onClick={create}>
            {busy ? 'Writing questions… (10–20s)' : 'Start a study session →'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <span style={styles.muted}>Have a code?</span>
          <input
            style={{ ...styles.input, marginTop: 0, width: 150, letterSpacing: 4, fontWeight: 800, textTransform: 'uppercase' }}
            value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={6}
          />
          <button style={{ ...styles.ghost, marginTop: 0 }} disabled={busy || code.trim().length < 6} onClick={join}>Join game</button>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 20 }}>
        {steps.map((s) => (
          <div key={s.n} style={{ ...styles.card, marginTop: 0, padding: 16 }}>
            <div style={{ ...groovy, fontSize: 30, lineHeight: 1 }}>{s.n}</div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>{s.text}</div>
          </div>
        ))}
      </div>
    </>
  )
}

// Shown when someone opens a room link before the app knows their name.
function NameGate({ children, onLeave }: { children: ReactNode; onLeave: () => void }) {
  const [ready, setReady] = useState(() => readName().trim().length > 0)
  const [name, setName] = useState('')
  if (ready) return <>{children}</>
  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>Join this quiz</h2>
      <label style={{ fontWeight: 700 }}>Your name
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" maxLength={24} autoFocus />
      </label>
      <button style={styles.button} disabled={!name.trim()} onClick={() => { saveName(name.trim()); setReady(true) }}>Join</button>{' '}
      <button style={styles.ghost} onClick={onLeave}>Cancel</button>
    </div>
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

  // Tell the navbar the room code and timer.
  useEffect(() => {
    if (!room) return
    const secondsLeft = room.status === 'question'
      ? Math.max(0, Math.ceil((room.questionStartedAt + QUESTION_SECONDS * 1000 - now) / 1000))
      : room.status === 'reveal'
        ? Math.max(0, Math.ceil((room.revealedAt + REVEAL_SECONDS * 1000 - now) / 1000))
        : 0
    setLiveStatus({ code, phase: room.status, secondsLeft })
  }, [room, now, code])
  useEffect(() => () => setLiveStatus(null), [])

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
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 6, color: YELLOW }}>{code}</div>
          <div style={styles.muted}>Source: {room.sourceLabel}</div>
        </div>
        <button style={styles.ghost} onClick={onLeave}>Leave</button>
      </div>

      {room.status !== 'lobby' && (
        <Scoreboard players={playerList} myId={myId} index={index} showAnswered={room.status === 'question'} />
      )}

      {room.status === 'lobby' && (
        <div style={styles.card}>
          <h2 style={styles.h2}>Waiting for players</h2>
          <p>Share this link, or have friends enter the code:</p>
          <input style={styles.input} readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {playerList.map((p) => (
              <span key={p.userId} style={{ padding: '6px 12px', borderRadius: 999, background: colorFor(p.userId), color: INK, fontWeight: 800 }}>
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
      <div style={{ display: 'grid', gap: 10 }}>
        {sorted.map((p, rank) => {
          const pct = Math.max(3, Math.round((p.score / top) * 100))
          const answered = showAnswered && p.answeredIndex === index
          return (
            <div key={p.userId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: p.userId === myId ? 800 : 600 }}>
                <span>{rank === 0 && p.score > 0 ? '👑 ' : ''}{p.name}{p.userId === myId ? ' (you)' : ''} {answered ? '✓' : ''}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.score}</span>
              </div>
              <div style={{ height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: colorFor(p.userId), borderRadius: 7, boxShadow: `0 0 12px ${colorFor(p.userId)}`, transition: 'width 800ms cubic-bezier(.2,.8,.2,1)' }} />
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
  const urgent = room.status === 'question' && secondsLeft <= 5

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={styles.muted}>Question {index + 1} of {room.questions.length}</span>
        {room.status === 'question'
          ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={styles.muted}>{answeredCount}/{playerCount} answered</span>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 22, fontWeight: 900, color: urgent ? '#fff' : INK,
                background: urgent ? '#e11d48' : YELLOW, boxShadow: urgent ? '0 0 18px #e11d48' : 'none', transition: 'background 300ms',
              }}>{secondsLeft}</div>
            </div>
          )
          : <span style={styles.muted}>{isLast ? 'Results' : 'Next question'} in {nextIn}s</span>}
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.3 }}>{question.question}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {question.choices.map((c, i) => {
          const isCorrect = !!reveal && reveal.answerIndex === i
          const isWrongPick = !!reveal && chosen === i && reveal.answerIndex !== i
          const faded = (!!reveal && !isCorrect) || (!reveal && chosen !== null && chosen !== i)
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => { setPicked(i); onAnswer(i) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                padding: '14px 16px', borderRadius: 14, cursor: locked ? 'default' : 'pointer',
                border: isWrongPick ? '3px solid #fca5a5' : chosen === i ? '3px solid #fff' : '3px solid transparent',
                background: CHOICE_COLORS[i], color: '#fff', fontSize: 17, fontWeight: 700,
                opacity: faded ? 0.35 : 1,
                boxShadow: isCorrect ? `0 0 0 4px #fff, 0 0 24px ${CHOICE_COLORS[i]}` : '0 4px 0 rgba(0,0,0,0.3)',
                transform: isCorrect ? 'scale(1.03)' : 'none', transition: 'opacity 300ms, transform 300ms',
              }}
            >
              <span style={{ minWidth: 32, height: 32, borderRadius: 8, background: 'rgba(0,0,0,0.25)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
                {LETTERS[i]}
              </span>
              <span style={{ flex: 1 }}>{c}</span>
              {isCorrect && <span style={{ fontSize: 22 }}>✓</span>}
            </button>
          )
        })}
      </div>
      {room.status === 'question' && chosen !== null && <p style={{ ...styles.muted, marginTop: 14 }}>Answer locked in. Waiting for the reveal…</p>}
      {reveal && (
        <div style={{ marginTop: 18 }}>
          {myAnswer
            ? <p style={{ fontSize: 20, fontWeight: 900, color: myAnswer.correct ? '#86efac' : '#fca5a5' }}>
                {myAnswer.correct ? `Correct! +${myAnswer.points}${myAnswer.first ? ' ⚡ first!' : ''}` : 'Not this time.'}
              </p>
            : <p style={{ fontSize: 20, fontWeight: 900, color: '#fca5a5' }}>No answer submitted.</p>}
          <blockquote style={{ borderLeft: `4px solid ${YELLOW}`, margin: 0, padding: '4px 0 4px 14px', fontStyle: 'italic' }}>“{plain(reveal.sourceQuote)}”</blockquote>
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
      <h2 style={styles.h2}>What you missed</h2>
      {missed.length === 0 && <p style={{ fontSize: 18, fontWeight: 800, color: YELLOW }}>Perfect round. Nothing to review! 🎉</p>}
      {missed.map(({ q, i, reveal, mine }) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <strong>{q.question}</strong>
          <p style={{ margin: '6px 0' }}>
            <span style={{ color: '#fca5a5' }}>Your answer: {mine ? q.choices[mine.choice] : 'none'}</span>
            {' · '}
            <span style={{ color: '#86efac' }}>Correct: {reveal ? q.choices[reveal.answerIndex] : '?'}</span>
          </p>
          {reveal && <blockquote style={{ borderLeft: `4px solid ${YELLOW}`, margin: 0, paddingLeft: 14, fontStyle: 'italic' }}>“{plain(reveal.sourceQuote)}”</blockquote>}
        </div>
      ))}
    </div>
  )
}



// Focused join page (/home?join): just the game code, styled as an admission ticket.
function JoinTicket({ onEnter }: { onEnter: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    setBusy(true); setError(null)
    const r = await callAction<{ roomId: string }>('joinRoom', { roomId: code, name: readName() })
    setBusy(false)
    if (r.ok) onEnter(r.data.roomId)
    else setError(r.error)
  }

  // Punches a half-circle notch into each side, like a real ticket stub.
  const notch = 'radial-gradient(circle 12px at 0 50%, #0000 98%, #000) left / 51% 100% no-repeat, radial-gradient(circle 12px at 100% 50%, #0000 98%, #000) right / 51% 100% no-repeat'

  return (
    <div style={{ textAlign: 'center', paddingTop: 32 }}>
      <h1 style={{ ...groovy, fontSize: 'clamp(40px, 9vw, 64px)', lineHeight: 1.05, margin: 0 }}>Got a ticket?</h1>
      <p style={{ ...styles.muted, fontSize: 16, marginTop: 12 }}>Enter the 6-letter code from your host.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (code.length === 6 && !busy) join() }}>
        <div style={{ display: 'inline-block', marginTop: 24, background: YELLOW, color: INK, borderRadius: 18, padding: '18px 36px', WebkitMask: notch, mask: notch }}>
          <div style={{ fontWeight: 800, letterSpacing: 3, fontSize: 12 }}>ADMIT ONE · GAME CODE</div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoFocus
            aria-label="Game code"
            placeholder="······"
            style={{
              width: 240, maxWidth: '60vw', marginTop: 6, background: 'transparent', border: 'none',
              borderBottom: `2px dashed ${INK}66`, color: INK, fontSize: 36, fontWeight: 900, letterSpacing: 10,
              textAlign: 'center', outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
        <div>
          <button type="submit" style={styles.button} disabled={busy || code.length < 6}>
            {busy ? 'Checking…' : 'Join game →'}
          </button>
        </div>
      </form>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  )
}
