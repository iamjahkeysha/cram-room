/**
 * Collection Schemas: all collections with columns and RBAC permissions.
 */
import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { roomsSchema, roomSecretsSchema, playersSchema, answersSchema, firstsSchema } from './schemas/cram-schemas'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  roomsSchema,
  roomSecretsSchema,
  playersSchema,
  answersSchema,
  firstsSchema,
]
