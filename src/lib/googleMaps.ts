import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

import { appConfig } from '@/config';

let configured = false;
let pending: Promise<typeof google.maps> | undefined;

/** Invoked only by the mounted admin boundary editor; never by the page listing. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (!appConfig.googleMapsApiKey)
    return Promise.reject(new Error('Google Maps is not configured.'));
  if (!configured) {
    setOptions({ key: appConfig.googleMapsApiKey, v: 'quarterly', region: 'ZW' });
    configured = true;
  }
  pending ??= Promise.all([importLibrary('maps'), importLibrary('core')])
    .then(() => google.maps)
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
