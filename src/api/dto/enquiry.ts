import type { Actor, IsoDateTime, WireDocument, WireVersioned } from '@/api/dto/common';

export const ENQUIRY_CATEGORIES = [
  'BOOKING_HELP',
  'PRICING_COVERAGE',
  'DELIVERY_ISSUE',
  'PAYMENT_ISSUE',
  'COMPLAINT',
  'OTHER',
] as const;
export type EnquiryCategory = (typeof ENQUIRY_CATEGORIES)[number];

export const ENQUIRY_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export interface EnquiryReply {
  id: string;
  body: string;
  author: Actor;
  sentAt: IsoDateTime;
  channel: 'WHATSAPP' | 'INTERNAL_NOTE';
  templateName?: string;
}

export interface WireEnquiry extends WireDocument, WireVersioned {
  ticketReference: string;
  townId: string;
  customerId: string;
  whatsappIdentity: string;
  name: string;
  /** Exactly what the customer submitted; staff workflow never expands this form. */
  category: EnquiryCategory;
  message: string;
  status: EnquiryStatus;
  owner?: Actor;
  linkedBookingId?: string;
  replies: EnquiryReply[];
}
