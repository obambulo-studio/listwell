import { queueAuditMessageSchema } from './schemas'
import type { QueueAuditMessage } from './types'

export function parseQueueMessage(value: unknown): QueueAuditMessage {
  return queueAuditMessageSchema.parse(value)
}

export function createQueueMessage(message: QueueAuditMessage): QueueAuditMessage {
  return queueAuditMessageSchema.parse(message)
}
