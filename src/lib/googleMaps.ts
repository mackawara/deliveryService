import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

import { appConfig } from '@/config';

let configured = false;
let pending: Promise<typeof google.maps> | undefined;

/** Shared by the boundary editor and branch pickup picker; loaded only when mounted. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (!appConfig.googleMapsApiKey)
    return Promise.reject(new Error('Google Maps is not configured.'));
  if (!configured) {
    setOptions({ key: appConfig.googleMapsApiKey, v: 'quarterly', region: 'ZW' });
    configured = true;
  }
  pending ??= Promise.all([importLibrary('maps'), importLibrary('core'), importLibrary('marker')])
    .then(() => google.maps)
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
