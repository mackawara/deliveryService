import {
  clampPageQuery,
  queryParams,
  toEntities,
  toEntity,
  toEntityPage,
  toPage,
} from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type { PageQuery, Page, WireList } from '@/api/dto/common';
import type {
  BookingHoldCode,
  BookingPaymentState,
  DeliveryStatus,
  PaymentMethod,
  WireBooking,
  WireBookingDetail,
} from '@/api/dto/booking';
import { allOf, entityTag, listTag } from '@/api/tags';
import type { Booking, BookingDetail } from '@/api/types';

export interface BookingListArgs extends PageQuery {
  /** Town is part of every town-scoped query argument (specification section 6). */
  townId?: string | null;
  status?: DeliveryStatus | null;
  paymentState?: BookingPaymentState | null;
  paymentMethod?: PaymentMethod | null;
  customerId?: string | null;
}

interface CommandBase {
  id: string;
  /** Sent where the endpoint accepts it, so a stale record conflicts instead of overwriting. */
  expectedVersion?: number;
}

export const bookingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listBookings: build.query<Page<Booking>, BookingListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/bookings',
          params: queryParams({
            townId: args.townId ?? undefined,
            status: args.status ?? undefined,
            paymentState: args.paymentState ?? undefined,
            paymentMethod: args.paymentMethod ?? undefined,
            customerId: args.customerId ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireBooking>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        listTag(
          'Booking',
          args.townId,
          args.status,
          args.paymentState,
          args.paymentMethod,
          args.customerId,
        ),
        allOf('Booking'),
        ...(result?.items ?? []).map((booking) => entityTag('Booking', booking.id)),
      ],
    }),

    getBooking: build.query<BookingDetail, string>({
      query: (id) => ({ url: `/admin/bookings/${id}` }),
      transformResponse: (response: WireBookingDetail): BookingDetail => ({
        booking: toEntity(response.booking),
        custodyHistory: toEntities(response.custodyHistory ?? []),
        assignments: toEntities(response.assignments ?? []),
        payments: toEntities(response.payments ?? []),
        cash: toEntities(response.cash ?? []),
        quotes: toEntities(response.quotes ?? []),
      }),
      providesTags: (_result, _error, id) => [entityTag('Booking', id)],
    }),

    /** Corrects the details an operator is allowed to change; a reason is mandatory. */
    correctBooking: build.mutation<
      Booking,
      CommandBase & {
        reason: string;
        pickup?: { addressLine?: string; landmark?: string; zoneCode?: string };
        dropoff?: {
          addressLine?: string;
          landmark?: string;
          zoneCode?: string;
          contactName?: string;
          contactPhone?: string;
        };
        operatorNotes?: string;
        parcelDescription?: string;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/bookings/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { booking: WireBooking }) => toEntity(response.booking),
      invalidatesTags: (_result, _error, args) => [entityTag('Booking', args.id), allOf('Booking')],
    }),

    /** A revised quote is a draft price until the customer accepts it. */
    createQuote: build.mutation<
      Booking,
      CommandBase & {
        adjustmentReason: string;
        acceptedExtraCodes?: string[];
        discount?: { code: string; label: string; amountCents: number };
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/bookings/${id}/quotes`, method: 'POST', body }),
      transformResponse: (response: { booking: WireBooking }) => toEntity(response.booking),
      invalidatesTags: (_result, _error, args) => [entityTag('Booking', args.id), allOf('Booking')],
    }),

    requestLocationPin: build.mutation<
      { requested: 'PICKUP' | 'DROPOFF' },
      CommandBase & { endpoint: 'PICKUP' | 'DROPOFF'; reason: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/bookings/${id}/location-requests`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, args) => [entityTag('Booking', args.id)],
    }),

    recordCashArrangement: build.mutation<
      Booking,
      CommandBase & {
        contact: { name: string; phone: string; relationship: 'SENDER' | 'RECIPIENT' | 'OTHER' };
        agreementRecord: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/bookings/${id}/cash-arrangements`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { booking: WireBooking }) => toEntity(response.booking),
      invalidatesTags: (_result, _error, args) => [entityTag('Booking', args.id), allOf('Booking')],
    }),

    /** Records an allowed delivery event. Capacity, payment and custody rules stay server-side. */
    recordDeliveryEvent: build.mutation<
      Booking,
      CommandBase & {
        newState: DeliveryStatus;
        reason?: string;
        proofReference?: string;
        evidence?: Record<string, unknown>;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/bookings/${id}/events`, method: 'POST', body }),
      transformResponse: (response: { booking: WireBooking }) => toEntity(response.booking),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Booking', args.id),
        allOf('Booking'),
        allOf('Driver'),
        'Overview',
      ],
    }),

    releaseHold: build.mutation<
      { booking: Booking; releasedForDispatch: boolean },
      CommandBase & {
        code: Extract<BookingHoldCode, 'OPERATOR_REVIEW' | 'CAPACITY' | 'CASH_ARRANGEMENT'>;
        reason: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/bookings/${id}/hold-releases`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { booking: WireBooking; releasedForDispatch: boolean }) => ({
        booking: toEntity(response.booking),
        releasedForDispatch: response.releasedForDispatch,
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Booking', args.id),
        allOf('Booking'),
        'Overview',
      ],
    }),

    cancelBooking: build.mutation<
      Booking,
      CommandBase & { reason: string; operationalConfirmation?: boolean }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/bookings/${id}/cancellations`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { booking: WireBooking }) => toEntity(response.booking),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Booking', args.id),
        allOf('Booking'),
        allOf('Driver'),
        'Overview',
      ],
    }),
  }),
});

/** Exposed for the overview, which counts a loaded page and never a town-wide total. */
export function loadedPageSummary<T>(page: Page<T> | undefined): {
  loaded: number;
  complete: boolean;
} {
  if (!page) return { loaded: 0, complete: false };
  return { loaded: page.items.length, complete: !page.hasProbableNextPage };
}

export const emptyPage = <T>(): Page<T> => toPage<T>([], { limit: 25, skip: 0 });

export const {
  useListBookingsQuery,
  useGetBookingQuery,
  useCorrectBookingMutation,
  useCreateQuoteMutation,
  useRequestLocationPinMutation,
  useRecordCashArrangementMutation,
  useRecordDeliveryEventMutation,
  useReleaseHoldMutation,
  useCancelBookingMutation,
} = bookingsApi;
