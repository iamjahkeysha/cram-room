/**
 * Landing page: a STATIC, prerendered page (no auth, no realtime).
 * 70s game-show marquee poster. Animations are CSS-only so it prerenders cleanly.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const YELLOW = '#facc15'
const INK = '#1e0b3a'
const BULBS = Array.from({ length: 24 }, (_, i) => i)

const css = `
@import url('https://fonts.googleapis.com/css2?family=Shrikhand&display=swap');
@keyframes cramBlink { 50% { opacity: .25; box-shadow: none } }
@keyframes cramRise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
.cram-landing-bulb { width: 10px; height: 10px; border-radius: 50%; background: #fde68a; box-shadow: 0 0 10px ${YELLOW};
  animation: cramBlink 1.2s infinite; flex: none }
.cram-landing-bulb:nth-child(odd) { animation-delay: .6s }
.cram-rise { animation: cramRise 700ms ease both }
.cram-btn { transition: transform 150ms }
.cram-btn:hover { transform: translateY(-2px) }
`

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <style>{css}</style>
      <div
        data-testid="static-landing"
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px',
          background: 'linear-gradient(160deg, #1e0b3a 0%, #3b0764 55%, #4c1d95 100%)', color: '#f5f3ff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 760, textAlign: 'center', padding: '28px 20px', borderRadius: 28,
            background: 'rgba(42,15,77,0.7)', border: `3px solid ${YELLOW}`, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}
        >
          <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', overflow: 'hidden' }}>
            {BULBS.map((i) => <i key={i} className="cram-landing-bulb" />)}
          </div>

          <h1
            className="cram-rise"
            style={{
              fontFamily: "'Shrikhand', cursive", fontWeight: 400, fontSize: 'clamp(52px, 12vw, 96px)', lineHeight: 1,
              color: YELLOW, margin: '36px 0 14px',
              textShadow: '3px 3px 0 #fb923c, 6px 6px 0 #f472b6, 9px 9px 0 #7c3aed',
            }}
          >
            Cram Room
          </h1>

          <p className="cram-rise" style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 800, margin: 0, animationDelay: '120ms' }}>
            Study smarter, together.
          </p>
          <p className="cram-rise" style={{ opacity: 0.8, fontSize: 17, maxWidth: 500, margin: '10px auto 0', animationDelay: '200ms' }}>
            Your notes become a live quiz show. Every answer comes with its source.
          </p>

          <div className="cram-rise" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28, animationDelay: '280ms' }}>
            <Link
              to="/home"
              className="cram-btn"
              style={{
                padding: '14px 26px', borderRadius: 14, background: YELLOW, color: INK, fontWeight: 900, fontSize: 17,
                textDecoration: 'none', boxShadow: '0 5px 0 #a16207',
              }}
            >
              Start studying
            </Link>
            <Link
              to="/home?join"
              className="cram-btn"
              style={{
                padding: '13px 22px', borderRadius: 14, border: '2px solid rgba(255,255,255,0.4)', color: '#fff',
                fontWeight: 700, fontSize: 17, textDecoration: 'none',
              }}
            >
              Join a game
            </Link>
          </div>

          <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', overflow: 'hidden', marginTop: 36 }}>
            {BULBS.map((i) => <i key={i} className="cram-landing-bulb" />)}
          </div>
        </div>
      </div>
    </>
  )
}

