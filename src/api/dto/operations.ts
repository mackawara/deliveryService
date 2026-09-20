import type { Actor, IsoDateTime, WireDocument } from '@/api/dto/common';
import type { WirePaymentAttempt } from '@/api/dto/finance';

export const AUDIT_CATEGORIES = [
  'BOOKING',
  'DISPATCH',
  'FINANCE',
  'RESTRICTION',
  'CONFIG',
  'FLEET',
  'SUPPORT',
  'SECURITY',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface WireAuditEvent extends WireDocument {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  category: AuditCategory;
  townId?: string;
  occurredAt: IsoDateTime;
  reason?: string;
  changeSummary?: Record<string, unknown>;
  /** Safe identifier for support; raw request payloads are never shown. */
  correlationId?: string;
}

export interface WireOutboxEvent extends WireDocument {
  type:
    'WHATSAPP_MESSAGE' | 'WHATSAPP_TEMPLATE' | 'PAYNOW_INITIATE' | 'PAYNOW_POLL' | 'OPERATOR_ALERT';
  status: 'PENDING' | 'IN_FLIGHT' | 'SENT' | 'FAILED' | 'DEAD';
  attempts: number;
  nextAttemptAt: IsoDateTime;
  createdAt: IsoDateTime;
  sentAt?: IsoDateTime;
  lastError?: string;
  correlationId?: string;
  bookingId?: string;
}

/** `GET /admin/operations/alerts` returns exactly these two collections. */
export interface WireAlerts {
  notificationFailures: WireOutboxEvent[];
  stuckPayments: WirePaymentAttempt[];
}

export interface WireMediaLink {
  url: string;
  expiresAt: IsoDateTime;
  contentType: string;
  bytes: number;
}
