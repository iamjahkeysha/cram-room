import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { generateQuestions } from './generateQuestions'

export const actions: Record<string, ActionHandler<Env>> = {
  generateQuestions,
}