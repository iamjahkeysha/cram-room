// TEMPORARY developer page. It shows the answers, so delete it before submitting.
import { useState } from 'react'
import { getAuthToken } from 'deepspace'

type Question = { question: string; choices: string[]; answerIndex: number; sourceQuote: string; explanation: string }
type Result = { questions: Question[]; dropped: number; sourceChars: number }

export default function GenerateTest() {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [seconds, setSeconds] = useState<number | null>(null)

  async function run() {
    setBusy(true); setError(null); setResult(null)
    const started = Date.now()
    try {
      const res = await fetch('/api/actions/generateQuestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuthToken()}` },
        body: JSON.stringify(url.trim() ? { url: url.trim() } : { text }),
      })
      const json = await res.json()
      if (json.success) setResult(json.data)
      else setError(json.error ?? `Request failed (${res.status})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSeconds(Math.round((Date.now() - started) / 100) / 10)
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px', fontFamily: 'system-ui' }}>
      <h1>Question pipeline test</h1>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Article link"
        style={{ display: 'block', width: '100%', padding: 8, marginTop: 16 }} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="...or paste notes (used when the link is empty)"
        style={{ display: 'block', width: '100%', padding: 8, marginTop: 16 }} />
      <button onClick={run} disabled={busy || (!url.trim() && !text.trim())} style={{ marginTop: 16, padding: '8px 16px' }}>
        {busy ? 'Generating…' : 'Generate questions'}
      </button>
      {seconds !== null && !busy && <p>Took {seconds}s</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && (
        <div>
          <p>{result.questions.length} kept, {result.dropped} dropped, from {result.sourceChars.toLocaleString()} characters.</p>
          <ol>
            {result.questions.map((q, i) => (
              <li key={i} style={{ marginBottom: 20 }}>
                <strong>{q.question}</strong>
                <ul>
                  {q.choices.map((c, j) => (
                    <li key={j} style={{ fontWeight: j === q.answerIndex ? 700 : 400 }}>{c} {j === q.answerIndex && '✓'}</li>
                  ))}
                </ul>
                <blockquote style={{ borderLeft: '3px solid #999', paddingLeft: 8 }}>“{q.sourceQuote}”</blockquote>
                <em>{q.explanation}</em>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}