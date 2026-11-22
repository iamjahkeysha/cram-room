/**
 * Top nav: 70s game-show marquee bar. Keeps the scaffold's sign-in/sign-out wiring
 * and the data-testid hooks the shipped tests rely on.
 * Layout: links on the left, logo centered, live game info + account on the right.
 */
import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { ChevronDown, LogOut, Menu, X } from 'lucide-react'
import type { Role } from '../constants'
import { nav } from '../nav'
import { useLiveStatus } from '../liveStatus'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui'

const YELLOW = '#facc15'
const INK = '#1e0b3a'
const BAR = '#2a0f4d'
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Shrikhand&display=swap'

function useGroovyFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_URL}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_URL
    document.head.appendChild(link)
  }, [])
}

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', fontSize: 13, fontWeight: 700,
  whiteSpace: 'nowrap',
}

export default function Navigation() {
  useGroovyFont()
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const live = useLiveStatus()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'
  const urgent = live?.phase === 'question' && live.secondsLeft <= 5

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const visibleNav = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    if (!item.roles) return true
    if (!profileReady) return false
    if (userRole === 'admin') return true
    return item.roles.includes(userRole as Role)
  })

  const navLink = (item: (typeof nav)[number]) => {
    const active = location.pathname.startsWith(item.path)
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        style={{
          padding: '6px 12px', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none',
          color: active ? INK : '#f5f3ffcc', background: active ? YELLOW : 'transparent',
        }}
      >
        {item.label}
      </Link>
    )
  }

  return (
    <>
      <style>{`
        @keyframes cramBlink { 50% { opacity: .25; box-shadow: none } }
        .cram-bulb { width: 8px; height: 8px; border-radius: 50%; background: #fde68a; box-shadow: 0 0 8px ${YELLOW};
          animation: cramBlink var(--blink, 1.2s) infinite; flex: none }
        .cram-bulb:nth-child(odd) { animation-delay: calc(var(--blink, 1.2s) / 2) }
      `}</style>
      <nav
        data-testid="app-navigation"
        style={{ position: 'relative', background: BAR, borderBottom: `3px solid ${YELLOW}`, paddingBottom: 18, color: '#fff' }}
      >
        <div
          className="mx-auto max-w-7xl px-4"
          style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, height: 64 }}
        >
          {/* Left: links (desktop) or menu button (phone) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div className="hidden items-center gap-1 md:flex">{visibleNav.map(navLink)}</div>
            {visibleNav.length > 0 && (
              <button
                className="inline-flex h-8 w-8 items-center justify-center md:hidden"
                style={{ color: '#fff', background: 'transparent', border: 'none' }}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
              </button>
            )}
          </div>

          {/* Center: logo */}
          <Link
            to="/home"
            style={{
              fontFamily: "'Shrikhand', cursive", fontSize: 'clamp(22px, 4vw, 30px)', lineHeight: 1, color: YELLOW,
              textDecoration: 'none', whiteSpace: 'nowrap', textAlign: 'center',
              textShadow: '2px 2px 0 #fb923c, 4px 4px 0 #f472b6, 6px 6px 0 #7c3aed',
            }}
          >
            Cram Room
          </Link>

          {/* Right: live game info + account */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
            {live && live.phase !== 'done' && (
              <>
                <span className="hidden lg:inline-flex" style={chip}>
                  Room <span style={{ color: YELLOW, letterSpacing: 2 }}>{live.code}</span>
                </span>
                {live.phase === 'question' && (
                  <span style={{
                    ...chip, border: 'none', fontWeight: 900,
                    background: urgent ? '#e11d48' : YELLOW, color: urgent ? '#fff' : INK,
                    boxShadow: urgent ? '0 0 14px #e11d48' : 'none', transition: 'background 300ms',
                  }}>
                    ⏱ {live.secondsLeft}s
                  </span>
                )}
                {live.phase === 'reveal' && <span className="hidden sm:inline-flex" style={chip}>Next in {live.secondsLeft}s</span>}
              </>
            )}

            {!isLoaded ? null : isSignedIn && !profileReady ? (
              <div style={{ display: 'flex', alignItems: 'center', borderRadius: 999, padding: 4, background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-6 w-6 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }} />
              </div>
            ) : isSignedIn && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Account menu"
                      className="group"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '4px 10px 4px 4px', fontSize: 14,
                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer',
                      }}
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={user.imageUrl ?? undefined} referrerPolicy="no-referrer" />
                        <AvatarFallback style={{ background: '#f472b6', color: INK, fontWeight: 900, fontSize: 12 }}>
                          {(user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span data-testid="nav-user-name" className="hidden max-w-[120px] truncate xl:inline">
                        {user.name || user.email}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150 group-data-[popup-open]:rotate-180" aria-hidden />
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="truncate font-medium text-foreground">{user.name || 'Signed in'}</div>
                    <div data-testid="nav-user-email" className="truncate text-xs font-normal text-muted-foreground">
                      {user.email}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut aria-hidden />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                data-testid="nav-sign-in-button"
                onClick={() => setShowAuthModal(true)}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: YELLOW, color: INK, fontWeight: 800, cursor: 'pointer', boxShadow: '0 3px 0 #a16207', whiteSpace: 'nowrap' }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="flex flex-col px-2 py-2 md:hidden" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            {visibleNav.map(navLink)}
          </div>
        )}

        <div
          aria-hidden
          style={{
            position: 'absolute', left: 12, right: 12, bottom: 5, display: 'flex', justifyContent: 'space-between', overflow: 'hidden',
            ['--blink' as string]: urgent ? '0.35s' : '1.2s',
          } as CSSProperties}
        >
          {Array.from({ length: 40 }, (_, i) => <i key={i} className="cram-bulb" />)}
        </div>
      </nav>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </>
  )
}
