import { baseApi } from '@/api/baseApi';
import { queryParams } from '@/api/adapters';
import type {
  CreateStaffBody,
  PhoneChangeBody,
  PhoneChangeVerifyBody,
  UpdateStaffBody,
  WirePhoneChange,
  WireStaffMember,
} from '@/api/dto/session';
import type { WireList } from '@/api/dto/common';
import { allOf, entityTag, listTag } from '@/api/tags';

/**
 * Admin staff provisioning (specification section 5.4, backend priority P0).
 *
 * Staff accounts are never created automatically after an OTP request, and a
 * town-scoped admin cannot grant access beyond their delegated authority: the server
 * enforces that and these calls surface its decision.
 */
export const staffApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listStaff: build.query<WireStaffMember[], { townId?: string | null } | void>({
      query: (args) => ({
        url: '/admin/staff',
        params: queryParams({ townId: args?.townId ?? undefined }),
      }),
      transformResponse: (response: WireList<WireStaffMember>) => response.items ?? [],
      providesTags: (result, _error, args) => [
        listTag('Staff', args?.townId),
        allOf('Staff'),
        ...(result ?? []).map((member) => entityTag('Staff', member.id)),
      ],
    }),

    createStaff: build.mutation<WireStaffMember, CreateStaffBody & { idempotencyKey: string }>({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/admin/staff',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: [allOf('Staff')],
    }),

    updateStaff: build.mutation<
      WireStaffMember,
      UpdateStaffBody & { id: string; idempotencyKey: string }
    >({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/admin/staff/${id}`,
        method: 'PATCH',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      // A role, town or status change takes effect server-side immediately, so the
      // signed-in session is refreshed alongside the directory.
      invalidatesTags: (_result, _error, args) => [
        entityTag('Staff', args.id),
        allOf('Staff'),
        'Session',
      ],
    }),

    requestStaffPhoneChange: build.mutation<
      WirePhoneChange,
      PhoneChangeBody & { id: string; idempotencyKey: string }
    >({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/admin/staff/${id}/phone-changes`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    }),

    verifyStaffPhoneChange: build.mutation<WireStaffMember, PhoneChangeVerifyBody & { id: string }>(
      {
        query: ({ id, ...body }) => ({
          url: `/admin/staff/${id}/phone-changes/verify`,
          method: 'POST',
          body,
        }),
        invalidatesTags: (_result, _error, args) => [entityTag('Staff', args.id), allOf('Staff')],
      },
    ),
  }),
});

export const {
  useListStaffQuery,
  useCreateStaffMutation,
  useUpdateStaffMutation,
  useRequestStaffPhoneChangeMutation,
  useVerifyStaffPhoneChangeMutation,
} = staffApi;
