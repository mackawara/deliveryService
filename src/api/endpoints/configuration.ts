import { queryParams, toEntities, toEntity } from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type { DimensionsCm, GeoArea, HandlingCode, WireList } from '@/api/dto/common';
import type {
  OperatingHours,
  RateExtra,
  TownFeatures,
  TownPolicy,
  TownRiskControls,
  WireParcelPreset,
  WirePublishResult,
  WireRateCard,
  WireTown,
  WireTownRow,
  WireZone,
  ZonePairRate,
} from '@/api/dto/configuration';
import { allOf, entityTag, listTag } from '@/api/tags';
import type { ParcelPreset, RateCard, Town, TownRow, Zone } from '@/api/types';

/**
 * Service configuration (specification section 4.8).
 *
 * Reads are open to operator and admin; writes are admin-only. Publishing a rate card
 * never changes the quote snapshot an accepted booking already holds.
 */
export const configurationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listTowns: build.query<TownRow[], void>({
      query: () => ({ url: '/admin/towns' }),
      transformResponse: (response: WireList<WireTownRow>) =>
        (response.items ?? []).map((row) => ({
          town: toEntity(row.town),
          launchReadiness: row.launchReadiness,
        })),
      providesTags: (result) => [
        listTag('Town'),
        allOf('Town'),
        ...(result ?? []).map((row) => entityTag('Town', row.town.id)),
      ],
    }),

    createTown: build.mutation<
      Town,
      {
        slug: string;
        name: string;
        timezone: string;
        serviceArea: GeoArea;
        operatingHours?: OperatingHours[];
        policy?: Partial<TownPolicy>;
        features?: Partial<TownFeatures>;
        supportContact?: string;
      }
    >({
      query: (body) => ({ url: '/admin/towns', method: 'POST', body }),
      transformResponse: (response: { town: WireTown }) => toEntity(response.town),
      invalidatesTags: [allOf('Town')],
    }),

    updateTown: build.mutation<
      Town,
      {
        id: string;
        name?: string;
        timezone?: string;
        serviceArea?: GeoArea;
        operatingHours?: OperatingHours[];
        policy?: Partial<TownPolicy>;
        features?: Partial<TownFeatures>;
        status?: 'ACTIVE' | 'DISABLED';
        supportContact?: string;
        /** Replaces the limits; an empty `codExposure` means no limit. */
        riskControls?: TownRiskControls;
        reason?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/towns/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { town: WireTown }) => toEntity(response.town),
      invalidatesTags: (_result, _error, args) => [entityTag('Town', args.id), allOf('Town')],
    }),

    listZones: build.query<Zone[], { townId: string; includeDisabled?: boolean }>({
      query: ({ townId, includeDisabled }) => ({
        url: '/admin/zones',
        params: queryParams({ townId, includeDisabled }),
      }),
      transformResponse: (response: WireList<WireZone>) => toEntities(response.items ?? []),
      providesTags: (result, _error, args) => [
        listTag('Zone', args.townId, args.includeDisabled),
        allOf('Zone'),
        ...(result ?? []).map((zone) => entityTag('Zone', zone.id)),
      ],
    }),

    createZone: build.mutation<
      Zone,
      {
        townId: string;
        code: string;
        label: string;
        aliases?: string[];
        polygon: GeoArea;
        priority?: number;
      }
    >({
      query: (body) => ({ url: '/admin/zones', method: 'POST', body }),
      transformResponse: (response: { zone: WireZone }) => toEntity(response.zone),
      invalidatesTags: [allOf('Zone')],
    }),

    updateZone: build.mutation<
      Zone,
      {
        id: string;
        label?: string;
        aliases?: string[];
        polygon?: GeoArea;
        priority?: number;
        status?: 'ACTIVE' | 'DISABLED';
        reason?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/zones/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { zone: WireZone }) => toEntity(response.zone),
      invalidatesTags: (_result, _error, args) => [entityTag('Zone', args.id), allOf('Zone')],
    }),

    listRateCards: build.query<RateCard[], { townId: string }>({
      query: ({ townId }) => ({ url: '/admin/rate-cards', params: queryParams({ townId }) }),
      transformResponse: (response: WireList<WireRateCard>) => toEntities(response.items ?? []),
      providesTags: (result, _error, args) => [
        listTag('RateCard', args.townId),
        allOf('RateCard'),
        ...(result ?? []).map((card) => entityTag('RateCard', card.id)),
      ],
    }),

    createRateCard: build.mutation<
      RateCard,
      { townId: string; zonePairRates: ZonePairRate[]; extras?: RateExtra[]; taxTreatment?: string }
    >({
      query: (body) => ({ url: '/admin/rate-cards', method: 'POST', body }),
      transformResponse: (response: { rateCard: WireRateCard }) => toEntity(response.rateCard),
      invalidatesTags: [allOf('RateCard')],
    }),

    /** Draft changes are saved before publishing. */
    updateRateCard: build.mutation<
      RateCard,
      {
        id: string;
        zonePairRates?: ZonePairRate[];
        extras?: RateExtra[];
        taxTreatment?: string;
        reason?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/rate-cards/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { rateCard: WireRateCard }) => toEntity(response.rateCard),
      invalidatesTags: (_result, _error, args) => [
        entityTag('RateCard', args.id),
        allOf('RateCard'),
      ],
    }),

    publishRateCard: build.mutation<
      { rateCard: RateCard; coverageGaps: string[] },
      { id: string; effectiveFrom: string; expectedVersion?: number }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/rate-cards/${id}/publish`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: WirePublishResult) => ({
        rateCard: toEntity(response.rateCard),
        coverageGaps: response.coverageGaps ?? [],
      }),
      invalidatesTags: (_result, _error, args) => [
        entityTag('RateCard', args.id),
        allOf('RateCard'),
      ],
    }),

    listParcelPresets: build.query<ParcelPreset[], { townId: string; includeRetired?: boolean }>({
      query: ({ townId, includeRetired }) => ({
        url: '/admin/parcel-presets',
        params: queryParams({ townId, includeRetired }),
      }),
      transformResponse: (response: WireList<WireParcelPreset>) => toEntities(response.items ?? []),
      providesTags: (result, _error, args) => [
        listTag('ParcelPreset', args.townId, args.includeRetired),
        allOf('ParcelPreset'),
        ...(result ?? []).map((preset) => entityTag('ParcelPreset', preset.id)),
      ],
    }),

    createParcelPreset: build.mutation<
      ParcelPreset,
      {
        townId: string;
        code: string;
        label: string;
        examples: string[];
        parcelClass: string;
        maxWeightKg: number;
        maxDimensionsCm: DimensionsCm;
        supportedHandling?: HandlingCode[];
      }
    >({
      query: (body) => ({ url: '/admin/parcel-presets', method: 'POST', body }),
      transformResponse: (response: { preset: WireParcelPreset }) => toEntity(response.preset),
      invalidatesTags: [allOf('ParcelPreset')],
    }),

    updateParcelPreset: build.mutation<
      ParcelPreset,
      {
        id: string;
        label?: string;
        examples?: string[];
        supportedHandling?: HandlingCode[];
        status?: 'ACTIVE' | 'RETIRED';
        reason?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/parcel-presets/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { preset: WireParcelPreset }) => toEntity(response.preset),
      invalidatesTags: (_result, _error, args) => [
        entityTag('ParcelPreset', args.id),
        allOf('ParcelPreset'),
      ],
    }),
  }),
});

export const {
  useListTownsQuery,
  useCreateTownMutation,
  useUpdateTownMutation,
  useListZonesQuery,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useListRateCardsQuery,
  useCreateRateCardMutation,
  useUpdateRateCardMutation,
  usePublishRateCardMutation,
  useListParcelPresetsQuery,
  useCreateParcelPresetMutation,
  useUpdateParcelPresetMutation,
} = configurationApi;
