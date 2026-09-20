import { baseApi } from '@/api/baseApi';
import type { WireAvailabilityResult, WireCandidateResult } from '@/api/dto/fleet';
import { allOf, entityTag } from '@/api/tags';

/**
 * Dispatch endpoints (specification section 4.3).
 *
 * An offer is "Awaiting driver acceptance", never Assigned: acceptance is confirmed by
 * refreshed server state, so nothing here is applied optimistically.
 */
export interface OfferResult {
  assignmentId: string;
  state: string;
  offerExpiresAt: string;
  version: number;
}

export const dispatchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCandidates: build.query<WireCandidateResult, string>({
      // The candidates route returns its result directly rather than in a wrapper.
      query: (bookingId) => ({ url: `/admin/bookings/${bookingId}/candidates` }),
      providesTags: (_result, _error, bookingId) => [entityTag('Candidates', bookingId)],
    }),

    createOffer: build.mutation<
      OfferResult,
      {
        bookingId: string;
        driverId: string;
        vehicleId: string;
        expectedVersion?: number;
        overrideReason?: string;
        idempotencyKey: string;
      }
    >({
      query: ({ bookingId, idempotencyKey, ...body }) => ({
        url: `/admin/bookings/${bookingId}/offers`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Booking', args.bookingId),
        entityTag('Candidates', args.bookingId),
        entityTag('Driver', args.driverId),
        entityTag('Vehicle', args.vehicleId),
        allOf('Booking'),
        allOf('Driver'),
        'Overview',
      ],
    }),

    /** Reassignment is deliberately separate from a first assignment. */
    createReassignment: build.mutation<
      { assignmentId: string; state: string },
      {
        bookingId: string;
        driverId: string;
        vehicleId: string;
        reason: string;
        custodyHandoverNote?: string;
        expectedVersion?: number;
        idempotencyKey: string;
      }
    >({
      query: ({ bookingId, idempotencyKey, ...body }) => ({
        url: `/admin/bookings/${bookingId}/reassignments`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Booking', args.bookingId),
        entityTag('Candidates', args.bookingId),
        entityTag('Driver', args.driverId),
        allOf('Booking'),
        allOf('Driver'),
        'Overview',
      ],
    }),

    /** Availability change; the server decides whether it applies now or after the job. */
    setDriverAvailability: build.mutation<
      WireAvailabilityResult,
      {
        driverId: string;
        status: 'AVAILABLE' | 'BREAK' | 'OFF_DUTY';
        reason: string;
        expectedVersion?: number;
        idempotencyKey: string;
      }
    >({
      query: ({ driverId, idempotencyKey, ...body }) => ({
        url: `/admin/drivers/${driverId}/availability`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Driver', args.driverId),
        allOf('Driver'),
      ],
    }),

    /** A recorded position never marks a driver available. */
    recordDriverLocation: build.mutation<
      { presence: unknown },
      {
        driverId: string;
        latitude: number;
        longitude: number;
        reason: string;
        observedAt?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ driverId, ...body }) => ({
        url: `/admin/drivers/${driverId}/locations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Driver', args.driverId),
        allOf('Driver'),
        allOf('Candidates'),
      ],
    }),
  }),
});

export const {
  useGetCandidatesQuery,
  useCreateOfferMutation,
  useCreateReassignmentMutation,
  useSetDriverAvailabilityMutation,
  useRecordDriverLocationMutation,
} = dispatchApi;
