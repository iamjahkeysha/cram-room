import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createRoom, joinRoom, startGame, advance, submitAnswer } from './roomActions'

// generateQuestions is deliberately NOT exposed on its own: it spends the app
// owner's credits, so it's only reachable through createRoom, which rate-limits.
export const actions: Record<string, ActionHandler<Env>> = {
  createRoom,
  joinRoom,
  startGame,
  advance,
  submitAnswer,
}
