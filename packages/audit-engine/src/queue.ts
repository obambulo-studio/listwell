import { queueAuditMessageSchema } from "./schemas";
import type { QueueAuditMessage } from "./types";

export const parseQueueMessage = (value: unknown): QueueAuditMessage =>
  queueAuditMessageSchema.parse(value);

export const createQueueMessage = (
  message: QueueAuditMessage
): QueueAuditMessage => queueAuditMessageSchema.parse(message);
