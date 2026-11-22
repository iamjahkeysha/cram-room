// A tiny shared store so the game page can tell the navbar the room code and timer.
import { useSyncExternalStore } from 'react'

export type LiveStatus = {
  code: string
  phase: 'lobby' | 'question' | 'reveal' | 'done'
  secondsLeft: number
} | null

let current: LiveStatus = null
const listeners = new Set<() => void>()

export function setLiveStatus(next: LiveStatus) {
  if (JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  listeners.forEach((l) => l())
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => current,
    () => current,
  )
}
