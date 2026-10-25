import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import type { ShopTownChoice } from '@/api/dto/shop';
import { polygons } from '@/features/configuration/zoneBoundary';
import { loadGoogleMaps } from '@/lib/googleMaps';

import { hasCoordinates, type PickupDraft } from './pickup';

export function PickupPicker({
  value,
  onChange,
  town,
}: {
  value: PickupDraft;
  onChange: (value: PickupDraft) => void;
  town?: ShopTownChoice;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  const [error, setError] = useState('');
  const [mapLink, setMapLink] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [maps, setMaps] = useState<typeof google.maps | null>(null);
  useEffect(() => {
    valueRef.current = value;
    changeRef.current = onChange;
    if (hasCoordinates(value)) {
      const position = { lat: Number(value.lat), lng: Number(value.lng) };
      marker.current?.setPosition(position);
      mapRef.current?.panTo(position);
    }
  }, [value, onChange]);
  useEffect(() => {
    let active = true;
    const authWindow = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = authWindow.gm_authFailure;
    const authFailure = () => {
      if (active)
        setError('The map could not load. Use your current location or paste coordinates below.');
      previousAuthFailure?.();
    };
    authWindow.gm_authFailure = authFailure;
    const timeout = setTimeout(() => {
      if (active)
        setError('The map timed out. Use your current location or paste coordinates below.');
    }, 12000);
    loadGoogleMaps()
      .then((api) => {
        if (!active || !container.current) return;
        clearTimeout(timeout);
        setError('');
        setMaps(api);
      })
      .catch(() => {
        if (active)
          setError('The map is unavailable. Use your current location or paste coordinates below.');
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      if (authWindow.gm_authFailure === authFailure)
        authWindow.gm_authFailure = previousAuthFailure;
    };
  }, [attempt]);
  useEffect(() => {
    if (!maps || !container.current) return;
    const current = valueRef.current;
    const hasPin = hasCoordinates(current);
    const map = new maps.Map(container.current, {
      center: hasPin
        ? { lat: Number(current.lat), lng: Number(current.lng) }
        : { lat: -18.4, lng: 26.5 },
      zoom: hasPin ? 17 : 12,
      streetViewControl: false,
      mapTypeControl: false,
      gestureHandling: 'cooperative',
    });
    mapRef.current = map;
    if (!hasPin && town) {
      const bounds = new maps.LatLngBounds();
      for (const polygon of polygons(town.serviceArea))
        for (const [lng, lat] of polygon[0] ?? []) bounds.extend({ lat, lng });
      if (!bounds.isEmpty()) map.fitBounds(bounds);
    }
    const pin = new maps.Marker({
      map,
      draggable: true,
      title: 'Branch pickup pin',
      ...(hasPin ? { position: { lat: Number(current.lat), lng: Number(current.lng) } } : {}),
    });
    marker.current = pin;
    const select = (point: google.maps.LatLng | null | undefined) => {
      if (point)
        changeRef.current({
          ...valueRef.current,
          lat: String(point.lat()),
          lng: String(point.lng()),
        });
    };
    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) =>
      select(event.latLng),
    );
    const dragListener = pin.addListener('dragend', (event: google.maps.MapMouseEvent) =>
      select(event.latLng),
    );
    return () => {
      clickListener.remove();
      dragListener.remove();
      pin.setMap(null);
      marker.current = null;
      mapRef.current = null;
    };
  }, [maps, town, attempt]);
  function locate() {
    if (!navigator.geolocation) {
      setError('Location is unavailable. Paste coordinates below.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...value,
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        });
      },
      () => setError('Location permission or signal is unavailable. Paste coordinates below.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  function pastePin() {
    const match = mapLink.match(/(?:@|[?&](?:q|query)=)?(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (!match || Math.abs(Number(match[1])) > 90 || Math.abs(Number(match[2])) > 180) {
      setError('Paste latitude, longitude or a map link containing those coordinates.');
      return;
    }
    onChange({ ...value, lat: match[1], lng: match[2] });
  }
  return (
    <Stack spacing={2}>
      <Typography>Tap the map at your pickup entrance, or drag the pin.</Typography>
      <Box
        ref={container}
        role="region"
        aria-label="Pickup map"
        sx={{ height: error ? 120 : 300, borderRadius: 1, bgcolor: 'action.hover' }}
      />
      {error && (
        <Alert
          severity="info"
          action={<Button onClick={() => setAttempt((current) => current + 1)}>Retry map</Button>}
        >
          {error}
        </Alert>
      )}
      <Button onClick={locate}>Use my current location</Button>
      <TextField
        label="Coordinates or map link"
        value={mapLink}
        onChange={(event) => setMapLink(event.target.value)}
        helperText="Paste latitude, longitude, or a full map URL containing coordinates."
      />
      <Button onClick={pastePin} disabled={!mapLink.trim()}>
        Use pasted pin
      </Button>
      <details>
        <summary>Enter or check coordinates</summary>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Latitude"
            type="number"
            value={value.lat}
            onChange={(event) => onChange({ ...value, lat: event.target.value })}
            slotProps={{ htmlInput: { step: 'any', min: -90, max: 90 } }}
          />
          <TextField
            label="Longitude"
            type="number"
            value={value.lng}
            onChange={(event) => onChange({ ...value, lng: event.target.value })}
            slotProps={{ htmlInput: { step: 'any', min: -180, max: 180 } }}
          />
        </Stack>
      </details>
      {value.lat && value.lng && (
        <Typography variant="body2">
          Pickup pin: {value.lat}, {value.lng}
        </Typography>
      )}
      <TextField
        required
        fullWidth
        label="Short pickup address"
        value={value.address}
        onChange={(event) => onChange({ ...value, address: event.target.value })}
        helperText="Building, street or a nearby landmark. The delivery team checks service coverage."
      />
    </Stack>
  );
}
