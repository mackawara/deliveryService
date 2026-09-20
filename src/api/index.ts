/**
 * Barrel for the API layer. Feature modules import hooks from here so endpoint
 * injection happens exactly once, when the store is created.
 */
export { baseApi } from '@/api/baseApi';
export * from '@/api/endpoints/bookings';
export * from '@/api/endpoints/configuration';
export * from '@/api/endpoints/customers';
export * from '@/api/endpoints/dispatch';
export * from '@/api/endpoints/enquiries';
export * from '@/api/endpoints/finance';
export * from '@/api/endpoints/operations';
export * from '@/api/endpoints/restrictions';
export * from '@/api/endpoints/session';
export * from '@/api/endpoints/staff';
export * from '@/api/errors';
export * from '@/api/polling';
export * from '@/api/types';
