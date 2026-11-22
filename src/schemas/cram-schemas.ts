import type { CollectionSchema } from 'deepspace/schema'

const none = { read: false, create: false, update: false, delete: false } as const
const readOnly = { read: true, create: false, update: false, delete: false } as const

// What every player sees: question text and choices only, never the answers
// (until a question is revealed). Only server actions write here.
export const roomsSchema: CollectionSchema = {
  name: 'rooms',
  columns: [
    { name: 'code', storage: 'text', interpretation: 'plain' },
    { name: 'hostId', storage: 'text', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'currentIndex', storage: 'number', interpretation: 'plain' },
    { name: 'questionStartedAt', storage: 'number', interpretation: 'plain' },
    { name: 'revealedAt', storage: 'number', interpretation: 'plain' },
    { name: 'questions', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'reveals', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'sourceLabel', storage: 'text', interpretation: 'plain' },
  ],
  permissions: { '*': none, viewer: readOnly, member: readOnly, admin: readOnly },
}

// The correct answers. No role can read this; only server actions use it.
export const roomSecretsSchema: CollectionSchema = {
  name: 'roomSecrets',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    { name: 'questions', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: { '*': none, viewer: none, member: none, admin: none },
}

export const playersSchema: CollectionSchema = {
  name: 'players',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'name', storage: 'text', interpretation: 'plain' },
    { name: 'score', storage: 'number', interpretation: 'plain' },
    { name: 'answeredIndex', storage: 'number', interpretation: 'plain' },
  ],
  permissions: { '*': none, viewer: readOnly, member: readOnly, admin: readOnly },
}

// Each player can read only their own answers. One answer per player per question.
export const answersSchema: CollectionSchema = {
  name: 'answers',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'questionIndex', storage: 'number', interpretation: 'plain' },
    { name: 'choice', storage: 'number', interpretation: 'plain' },
    { name: 'correct', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'first', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'points', storage: 'number', interpretation: 'plain' },
  ],
  ownerField: 'userId',
  uniqueOn: ['roomId', 'userId', 'questionIndex'],
  permissions: {
    '*': none,
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: 'own', create: false, update: false, delete: false },
  },
}

// At most one row per question: the platform refuses a second one,
// which makes "first correct answer" reliable even when answers arrive together.
export const firstsSchema: CollectionSchema = {
  name: 'firsts',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    { name: 'questionIndex', storage: 'number', interpretation: 'plain' },
    { name: 'userId', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['roomId', 'questionIndex'],
  permissions: { '*': none, viewer: none, member: none, admin: none },
}
