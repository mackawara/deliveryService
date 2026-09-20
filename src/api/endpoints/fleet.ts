import { clampPageQuery, queryParams, toEntity, toEntityPage, toPage } from '@/api/adapters';
import { baseApi } from '@/api/baseApi';
import type {
  PageQuery,
  Page,
  VehicleClass,
  HandlingCode,
  DimensionsCm,
  WireList,
} from '@/api/dto/common';
import type { DriverStatus, WireDriver, WireDriverRow, WireVehicle } from '@/api/dto/fleet';
import { allOf, entityTag, listTag } from '@/api/tags';
import type { Driver, DriverRow, Vehicle } from '@/api/types';

export interface DriverListArgs extends PageQuery {
  townId?: string | null;
  status?: DriverStatus | null;
}

export interface VehicleListArgs extends PageQuery {
  townId?: string | null;
  serviceStatus?: 'IN_SERVICE' | 'MAINTENANCE' | 'OUT_OF_SERVICE' | null;
}

export interface VehicleCapacityInput {
  maxWeightKg: number;
  cargoDimensionsCm: DimensionsCm;
  accessOpeningCm: { widthCm: number; heightCm: number };
}

export const fleetApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Driver rows arrive as `{ driver, presence }`; presence may be missing. */
    listDrivers: build.query<Page<DriverRow>, DriverListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/drivers',
          params: queryParams({
            townId: args.townId ?? undefined,
            status: args.status ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireDriverRow>, _meta, args) =>
        toPage(
          (response.items ?? []).map((row) => ({
            driver: toEntity(row.driver),
            presence: row.presence ? toEntity(row.presence) : null,
          })),
          clampPageQuery(args),
        ),
      providesTags: (result, _error, args) => [
        listTag('Driver', args.townId, args.status),
        allOf('Driver'),
        ...(result?.items ?? []).map((row) => entityTag('Driver', row.driver.id)),
      ],
    }),

    createDriver: build.mutation<
      Driver,
      {
        townId: string;
        name: string;
        phone: string;
        staffReference?: string;
        allowedVehicleClasses: VehicleClass[];
        assignedVehicleId?: string;
        ownershipModel?: 'COMPANY' | 'INDEPENDENT';
      }
    >({
      query: (body) => ({ url: '/admin/drivers', method: 'POST', body }),
      transformResponse: (response: { driver: WireDriver }) => toEntity(response.driver),
      invalidatesTags: [allOf('Driver')],
    }),

    /**
     * Status and approval changes are admin-only on the backend; the interface only
     * offers them to an admin, and the server still decides.
     */
    updateDriver: build.mutation<
      Driver,
      {
        id: string;
        name?: string;
        allowedVehicleClasses?: VehicleClass[];
        staffReference?: string;
        assignedVehicleId?: string;
        status?: DriverStatus;
        approvalState?: string;
        reason?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/drivers/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { driver: WireDriver }) => toEntity(response.driver),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Driver', args.id),
        allOf('Driver'),
        allOf('Vehicle'),
      ],
    }),

    listVehicles: build.query<Page<Vehicle>, VehicleListArgs>({
      query: (args) => {
        const page = clampPageQuery(args);
        return {
          url: '/admin/vehicles',
          params: queryParams({
            townId: args.townId ?? undefined,
            serviceStatus: args.serviceStatus ?? undefined,
            ...page,
          }),
        };
      },
      transformResponse: (response: WireList<WireVehicle>, _meta, args) =>
        toEntityPage(response, clampPageQuery(args)),
      providesTags: (result, _error, args) => [
        listTag('Vehicle', args.townId, args.serviceStatus),
        allOf('Vehicle'),
        ...(result?.items ?? []).map((vehicle) => entityTag('Vehicle', vehicle.id)),
      ],
    }),

    createVehicle: build.mutation<
      Vehicle,
      VehicleCapacityInput & {
        townId: string;
        registration: string;
        vehicleClass: VehicleClass;
        label?: string;
        handlingCapabilities?: HandlingCode[];
      }
    >({
      query: (body) => ({ url: '/admin/vehicles', method: 'POST', body }),
      transformResponse: (response: { vehicle: WireVehicle }) => toEntity(response.vehicle),
      invalidatesTags: [allOf('Vehicle')],
    }),

    updateVehicle: build.mutation<
      Vehicle,
      Partial<VehicleCapacityInput> & {
        id: string;
        label?: string;
        serviceStatus?: 'IN_SERVICE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
        handlingCapabilities?: HandlingCode[];
        vehicleClass?: VehicleClass;
        reason?: string;
        expectedVersion?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/vehicles/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { vehicle: WireVehicle }) => toEntity(response.vehicle),
      invalidatesTags: (_result, _error, args) => [
        entityTag('Vehicle', args.id),
        allOf('Vehicle'),
        allOf('Driver'),
      ],
    }),
  }),
});

export const {
  useListDriversQuery,
  useCreateDriverMutation,
  useUpdateDriverMutation,
  useListVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
} = fleetApi;
