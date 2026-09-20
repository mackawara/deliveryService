/**
 * Response adapters (specification section 9).
 *
 * Responses vary between `{items}`, `{booking}`, composite detail objects and direct
 * results, and MongoDB documents carry `_id`. Everything is normalized here at the API
 * boundary so feature code never branches on wire shape.
 */
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SKIP,
  type EntityOf,
  type Page,
  type PageQuery,
  type WireDocument,
  type WireList,
} from '@/api/dto/common';

/** Replaces `_id` with `id`, leaving every other field untouched. */
export function toEntity<T extends WireDocument>(document: T): EntityOf<T> {
  const { _id, ...rest } = document;
  return { ...rest, id: _id } as EntityOf<T>;
}

export function toEntities<T extends WireDocument>(documents: readonly T[]): Array<EntityOf<T>> {
  return documents.map(toEntity);
}

/** Clamps paging arguments to the server's documented caps before they are sent. */
export function clampPageQuery(query: PageQuery | undefined): Required<PageQuery> {
  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const skip = Math.min(Math.max(query?.skip ?? 0, 0), MAX_SKIP);
  return { limit, skip };
}

/**
 * Builds a page without inventing a total: a full-sized page means a next-page probe
 * is allowed, and that probe may legitimately come back empty.
 */
export function toPage<T>(items: T[], query: Required<PageQuery>): Page<T> {
  return {
    items,
    limit: query.limit,
    skip: query.skip,
    hasProbableNextPage: items.length === query.limit && query.skip + query.limit <= MAX_SKIP,
  };
}

/** Unwraps `{ items }` and normalizes each document. */
export function toEntityPage<T extends WireDocument>(
  response: WireList<T>,
  query: Required<PageQuery>,
): Page<EntityOf<T>> {
  return toPage(toEntities(response.items ?? []), query);
}

/** Drops undefined, null and empty-string entries so no empty filter is sent. */
export function queryParams(params: Record<string, string | number | boolean | undefined | null>) {
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    cleaned[key] = value;
  }
  return cleaned;
}
