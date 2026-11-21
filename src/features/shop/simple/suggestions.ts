import type { WireSuggestion } from '@/api/dto/shop';

/** The order item prompts are offered in: the one that matters most to customers first. */
const ITEM_ORDER = ['ADD_ITEM_PHOTO', 'ADD_ITEM_DESCRIPTION', 'ADD_ITEM_CATEGORY'];

export const suggestionKey = (suggestion: Pick<WireSuggestion, 'code' | 'itemId'>) =>
  `${suggestion.code}:${suggestion.itemId ?? ''}`;

const snoozeKey = (ownerId: string, shopId: string) =>
  `shop-suggestion-snooze:v1:${ownerId}:${shopId}`;

/** "Not now" is a browser preference only; nothing is sent to the API. */
export function readSnoozed(ownerId: string, shopId: string): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(snoozeKey(ownerId, shopId)) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}

export function snooze(ownerId: string, shopId: string, suggestion: WireSuggestion): Set<string> {
  const next = readSnoozed(ownerId, shopId);
  next.add(suggestionKey(suggestion));
  try {
    localStorage.setItem(snoozeKey(ownerId, shopId), JSON.stringify([...next]));
  } catch {
    /* The popup then simply comes back next time. */
  }
  return next;
}

/** At most one prompt after a save: the most useful missing detail for that item. */
export function popupSuggestion(
  suggestions: WireSuggestion[],
  itemId: string,
  snoozed: Set<string>,
): WireSuggestion | undefined {
  return suggestions
    .filter(
      (suggestion) =>
        suggestion.itemId === itemId &&
        ITEM_ORDER.includes(suggestion.code) &&
        !snoozed.has(suggestionKey(suggestion)),
    )
    .sort((left, right) => ITEM_ORDER.indexOf(left.code) - ITEM_ORDER.indexOf(right.code))[0];
}

export interface SuggestionGroup {
  code: string;
  label: string;
  count: number;
  /** The suggestions in this group, so one can be opened in place. */
  entries: WireSuggestion[];
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many.replace('{n}', String(count));
}

function groupLabel(code: string, count: number, fallback: string): string {
  switch (code) {
    case 'ADD_ITEM_PHOTO':
      return plural(count, '1 item needs a photo', '{n} items need a photo');
    case 'ADD_ITEM_DESCRIPTION':
      return plural(count, '1 item could use a description', '{n} items could use a description');
    case 'ADD_ITEM_CATEGORY':
      return plural(count, '1 item has no category', '{n} items have no category');
    case 'ADD_PICKUP_PIN':
      return 'Pin your shop on the map';
    case 'ADD_PICKUP_ADDRESS':
      return 'Add a short pickup address';
    default:
      return fallback;
  }
}

/** "3 items need a photo": one line per kind of suggestion, most important first. */
export function groupSuggestions(suggestions: WireSuggestion[]): SuggestionGroup[] {
  const order = ['ADD_PICKUP_PIN', ...ITEM_ORDER, 'ADD_PICKUP_ADDRESS'];
  const groups = new Map<string, WireSuggestion[]>();
  for (const suggestion of suggestions)
    groups.set(suggestion.code, [...(groups.get(suggestion.code) ?? []), suggestion]);
  const rank = (code: string) => (order.includes(code) ? order.indexOf(code) : order.length);
  return [...groups.entries()]
    .sort(([left], [right]) => rank(left) - rank(right))
    .map(([code, entries]) => ({
      code,
      label: groupLabel(code, entries.length, entries[0].message),
      count: entries.length,
      entries,
    }));
}
