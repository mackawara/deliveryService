import { clampPageQuery, queryParams, toEntities, toEntity, toEntityPage } from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type { Page, PageQuery, WireList } from '@/api/dto/common';
import type {
  EvidenceKind,
  RestrictionReason,
  RestrictionStatus,
  WireFraudReport,
  WireRestriction,
  WireRestrictionDetail,
} from '@/api/dto/restriction';
import { allOf, entityTag, listTag } from '@/api/tags';
import type { FraudReport, Restriction } from '@/api/types';

/**
 * Blacklist and fraud review (specification section 4.7).
 *
 * An operator reports a suspicion from a booking; only an admin activates a
 * restriction. A standalone pending-report queue needs the additional fraud-report API
 * listed in section 11, so this module exposes only what the backend actually serves.
 */
export interface RestrictionListArgs extends PageQuery {
  status?: RestrictionStatus | null;
  reasonCode?: RestrictionReason | null;
  customerId?: string | null;
  townId?: string | null;
}

export interface EvidenceInput {
  kind: EvidenceKind;
  reference: string;
  note?: string;
}

export const restrictionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listRestrictions: build.query<Page<Restriction>, RestrictionListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/restrictions',
          params: queryParams({
            status: args.status ?? undefined,
            reasonCode: args.reasonCode ?? undefined,
            customerId: args.customerId ?? undefined,
            townId: args.townId ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireRestriction>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        listTag('Restriction', args.townId, args.status, args.reasonCode, args.customerId),
        allOf('Restriction'),
        ...(result?.items ?? []).map((restriction) => entityTag('Restriction', restriction.id)),
      ],
    }),

    getRestriction: build.query<{ restriction: Restriction; fraudReports: FraudReport[] }, string>({
      query: (id) => ({ url: `/admin/restrictions/${id}` }),
      transformResponse: (response: WireRestrictionDetail) => ({
        restriction: toEntity(response.restriction),
        fraudReports: toEntities(response.fraudReports ?? []),
      }),
      providesTags: (_result, _error, id) => [entityTag('Restriction', id)],
    }),

    /** An allegation is an incident for admin review, never an automatic blacklist. */
    reportFraud: build.mutation<
      FraudReport,
      {
        bookingId: string;
        reasonCode: RestrictionReason;
        allegation: string;
        evidence?: EvidenceInput[];
      }
    >({
      query: ({ bookingId, ...body }) => ({
        url: `/admin/bookings/${bookingId}/fraud-reports`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { fraudReport: WireFraudReport }) =>
        toEntity(response.fraudReport),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Booking', args.bookingId),
        allOf('FraudReport'),
      ],
    }),

    activateRestriction: build.mutation<
      Restriction,
      {
        customerId: string;
        reasonCode: RestrictionReason;
        explanation: string;
        scope: { type: 'TOWN' | 'PLATFORM'; townId?: string };
        evidence?: EvidenceInput[];
        relatedBookingIds?: string[];
        effectiveFrom?: string;
        reviewAt?: string;
        expiresAt?: string;
        expectedVersion?: number;
        idempotencyKey: string;
      }
    >({
      query: ({ customerId, idempotencyKey, ...body }) => ({
        url: `/admin/customers/${customerId}/restrictions`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: { restriction: WireRestriction }) =>
        toEntity(response.restriction),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Customer', args.customerId),
        allOf('Restriction'),
        allOf('Customer'),
        allOf('Booking'),
      ],
    }),

    /** Revocation requires a review reason and never deletes history. */
    revokeRestriction: build.mutation<
      Restriction,
      {
        id: string;
        reason: string;
        reviewOutcome?: string;
        expectedVersion?: number;
        idempotencyKey: string;
      }
    >({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/admin/restrictions/${id}/revoke`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: { restriction: WireRestriction }) =>
        toEntity(response.restriction),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Restriction', args.id),
        allOf('Restriction'),
        allOf('Customer'),
      ],
    }),
  }),
});

export const {
  useListRestrictionsQuery,
  useGetRestrictionQuery,
  useReportFraudMutation,
  useActivateRestrictionMutation,
  useRevokeRestrictionMutation,
} = restrictionsApi;
