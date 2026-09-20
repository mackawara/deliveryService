import { clampPageQuery, queryParams, toEntity, toEntityPage } from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type { Page, PageQuery, WireList } from '@/api/dto/common';
import type { EnquiryCategory, EnquiryStatus, WireEnquiry } from '@/api/dto/enquiry';
import { allOf, entityTag, listTag } from '@/api/tags';
import type { Enquiry } from '@/api/types';

/**
 * Support queue (specification section 4.5). A reply maps to the API field `body`; a
 * full chat timeline needs the conversation-history endpoint listed in section 11 and
 * is never fabricated from the single enquiry message.
 */
export interface EnquiryListArgs extends PageQuery {
  townId?: string | null;
  status?: EnquiryStatus | null;
  category?: EnquiryCategory | null;
}

export const enquiriesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listEnquiries: build.query<Page<Enquiry>, EnquiryListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/enquiries',
          params: queryParams({
            townId: args.townId ?? undefined,
            status: args.status ?? undefined,
            category: args.category ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireEnquiry>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        listTag('Enquiry', args.townId, args.status, args.category),
        allOf('Enquiry'),
        ...(result?.items ?? []).map((enquiry) => entityTag('Enquiry', enquiry.id)),
      ],
    }),

    updateEnquiry: build.mutation<
      Enquiry,
      {
        id: string;
        status?: EnquiryStatus;
        takeOwnership?: boolean;
        linkedBookingId?: string;
        reason?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/enquiries/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { enquiry: WireEnquiry }) => toEntity(response.enquiry),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Enquiry', args.id),
        allOf('Enquiry'),
        'Overview',
      ],
    }),

    /** Payload field is `body`; success confirms submission, not WhatsApp delivery. */
    replyToEnquiry: build.mutation<Enquiry, { id: string; body: string; expectedVersion?: number }>(
      {
        query: ({ id, ...payload }) => ({
          url: `/admin/enquiries/${id}/replies`,
          method: 'POST',
          body: payload,
        }),
        transformResponse: (response: { enquiry: WireEnquiry }) => toEntity(response.enquiry),
        invalidatesTags: (_result, _error, args) => [
          entityTag('Enquiry', args.id),
          allOf('Enquiry'),
        ],
      },
    ),
  }),
});

export const { useListEnquiriesQuery, useUpdateEnquiryMutation, useReplyToEnquiryMutation } =
  enquiriesApi;
