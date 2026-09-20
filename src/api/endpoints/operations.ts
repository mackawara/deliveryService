import { clampPageQuery, queryParams, toEntities, toEntityPage } from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type { Page, PageQuery, WireList } from '@/api/dto/common';
import type {
  AuditCategory,
  WireAlerts,
  WireAuditEvent,
  WireMediaLink,
} from '@/api/dto/operations';
import type { WireOverview } from '@/api/dto/overview';
import { allOf, listTag } from '@/api/tags';
import type { AuditEvent, OutboxEvent, PaymentAttempt } from '@/api/types';

/**
 * Alerts, audit, media links and the proposed overview summary.
 */
export interface AuditListArgs extends PageQuery {
  entityType?: string | null;
  entityId?: string | null;
  actorId?: string | null;
  /** Ignored server-side for finance users, who only ever see finance events. */
  category?: AuditCategory | null;
  from?: string | null;
  to?: string | null;
}

export interface AlertsResult {
  notificationFailures: OutboxEvent[];
  stuckPayments: PaymentAttempt[];
}

export const operationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Only the alert types the current endpoint serves; others need server support. */
    getAlerts: build.query<AlertsResult, void>({
      query: () => ({ url: '/admin/operations/alerts' }),
      transformResponse: (response: WireAlerts): AlertsResult => ({
        notificationFailures: toEntities(response.notificationFailures ?? []),
        stuckPayments: toEntities(response.stuckPayments ?? []),
      }),
      providesTags: ['Alerts'],
    }),

    listAuditEvents: build.query<Page<AuditEvent>, AuditListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/audit-events',
          params: queryParams({
            entityType: args.entityType ?? undefined,
            entityId: args.entityId ?? undefined,
            actorId: args.actorId ?? undefined,
            category: args.category ?? undefined,
            from: args.from ?? undefined,
            to: args.to ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireAuditEvent>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (_result, _error, args) => [
        listTag(
          'AuditEvent',
          args.entityType,
          args.entityId,
          args.actorId,
          args.category,
          args.from,
          args.to,
        ),
        allOf('AuditEvent'),
      ],
    }),

    /** Image links expire; the viewer refetches rather than caching the URL. */
    getMediaLink: build.query<WireMediaLink, string>({
      query: (mediaId) => ({ url: `/admin/media/${mediaId}/link` }),
      keepUnusedDataFor: 0,
    }),

    /**
     * Proposed `GET /api/v1/admin/overview` (section 11, P1). Until it exists the
     * overview page shows links and labelled loaded-page counts instead of totals.
     */
    getOverview: build.query<WireOverview, { townId?: string | null }>({
      query: ({ townId }) => ({
        url: '/admin/overview',
        params: queryParams({ townId: townId ?? undefined }),
      }),
      providesTags: ['Overview'],
    }),
  }),
});

export const {
  useGetAlertsQuery,
  useListAuditEventsQuery,
  useGetMediaLinkQuery,
  useGetOverviewQuery,
} = operationsApi;
