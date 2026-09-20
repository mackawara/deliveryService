/**
 * Cache tags (specification section 6). Resources are tagged by ID and by a scoped list
 * key that carries the town/filter context, so a successful command refetches exactly
 * the affected lists rather than the whole cache.
 */
export const TAG_TYPES = [
  'Session',
  'Staff',
  'Overview',
  'Booking',
  'Candidates',
  'Driver',
  'Vehicle',
  'Customer',
  'Enquiry',
  'Payment',
  'CashEntry',
  'Refund',
  'Restriction',
  'FraudReport',
  'Town',
  'Zone',
  'RateCard',
  'ParcelPreset',
  'AuditEvent',
  'Alerts',
] as const;

export type TagType = (typeof TAG_TYPES)[number];

export interface Tag {
  type: TagType;
  id: string;
}

/** A list tag scoped by town and any other filter context that changes the result. */
export function listTag(
  type: TagType,
  ...scope: Array<string | number | boolean | null | undefined>
): Tag {
  const key = scope.filter((part) => part !== undefined && part !== null && part !== '').join('|');
  return { type, id: `LIST:${key.length > 0 ? key : 'all'}` };
}

/** Every list of this type, regardless of scope, plus the type's entity tags. */
export function allOf(type: TagType): Tag {
  return { type, id: 'ALL' };
}

export function entityTag(type: TagType, id: string): Tag {
  return { type, id };
}

export function entityTags(type: TagType, ids: Array<string | undefined>): Tag[] {
  return ids.filter((id): id is string => Boolean(id)).map((id) => entityTag(type, id));
}
