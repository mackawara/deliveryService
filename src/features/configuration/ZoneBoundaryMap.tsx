import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useEffect, useRef, useState } from 'react';

import type { GeoArea, Position } from '@/api/dto/common';
import type { Zone } from '@/api/types';
import { appConfig } from '@/config';
import { closeRing, openRing, polygons } from '@/features/configuration/zoneBoundary';
import { loadGoogleMaps } from '@/lib/googleMaps';

interface Props {
  value: GeoArea | null;
  townArea: GeoArea;
  zones: Zone[];
  editingId?: string;
  onChange: (area: GeoArea | null) => void;
  onDrawingChange: (drawing: boolean) => void;
}

function mapPaths(rings: Position[][]): google.maps.LatLngLiteral[][] {
  const paths = rings.map(openRing);
  const winding = (ring: Position[]) =>
    ring.reduce((sum, [x, y], index) => {
      const next = ring[(index + 1) % ring.length]!;
      return sum + x * next[1] - next[0] * y;
    }, 0);
  const outerWinding = Math.sign(winding(paths[0] ?? []));
  return paths.map((path, index) => {
    const ring =
      index > 0 && Math.sign(winding(path)) === outerWinding ? [...path].reverse() : path;
    return ring.map(([lng, lat]) => ({ lat, lng }));
  });
}

function removeShapes(shapes: google.maps.Polygon[], maps: typeof google.maps) {
  for (const shape of shapes) {
    shape.getPaths().forEach((path) => maps.event.clearInstanceListeners(path));
    maps.event.clearInstanceListeners(shape);
    shape.setMap(null);
  }
  shapes.length = 0;
}

/** Google shapes are edited locally; saving sends ordinary GeoJSON to our own API. */
export function ZoneBoundaryMap({
  value,
  townArea,
  zones,
  editingId,
  onChange,
  onDrawingChange,
}: Props) {
  const theme = useTheme();
  const activeColour = theme.palette.primary.main;
  const townColour = theme.palette.text.primary;
  const neighbourColour = theme.palette.text.secondary;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const selected = useRef<google.maps.Polygon[]>([]);
  const neighbours = useRef<google.maps.Polygon[]>([]);
  const renderedValue = useRef('');
  const changeRef = useRef(onChange);
  const initialArea = useRef(value ?? townArea);
  const [maps, setMaps] = useState<typeof google.maps | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [corners, setCorners] = useState<Position[]>([]);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!appConfig.googleMapsApiKey) return;
    let active = true;
    const selectedShapes = selected.current;
    const neighbourShapes = neighbours.current;
    const authWindow = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = authWindow.gm_authFailure;
    const authFailure = () => {
      if (active)
        setError(
          'Google Maps could not authorize this website. Check the map account and website restrictions, then reload the page.',
        );
      previousAuthFailure?.();
    };
    authWindow.gm_authFailure = authFailure;
    const timeout = setTimeout(() => {
      if (active)
        setError('The map is taking too long to load. Check your connection and try again.');
    }, 20000);
    loadGoogleMaps()
      .then((api) => {
        if (!active || !container.current) return;
        clearTimeout(timeout);
        const map = new api.Map(container.current, {
          center: { lat: -18.4, lng: 26.5 },
          zoom: 12,
          mapTypeId: 'roadmap',
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
          gestureHandling: 'cooperative',
          mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] },
        });
        mapRef.current = map;
        const bounds = new api.LatLngBounds();
        for (const polygon of polygons(initialArea.current)) {
          for (const ring of polygon) for (const [lng, lat] of ring) bounds.extend({ lat, lng });
        }
        map.fitBounds(bounds, 36);
        setMaps(api);
      })
      .catch(() => {
        clearTimeout(timeout);
        if (active)
          setError(
            'Google Maps could not load. Check your connection or map configuration and try again.',
          );
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      if (authWindow.gm_authFailure === authFailure)
        authWindow.gm_authFailure = previousAuthFailure;
      if (mapRef.current && window.google?.maps) {
        removeShapes(selectedShapes, window.google.maps);
        removeShapes(neighbourShapes, window.google.maps);
        window.google.maps.event.clearInstanceListeners(mapRef.current);
      }
      mapRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (!maps || !mapRef.current) return;
    const neighbourShapes = neighbours.current;
    removeShapes(neighbourShapes, maps);
    const layers = [
      { area: townArea, colour: townColour, town: true },
      ...zones
        .filter((zone) => zone.id !== editingId && zone.status === 'ACTIVE')
        .map((zone) => ({ area: zone.polygon, colour: neighbourColour, town: false })),
    ];
    for (const layer of layers) {
      for (const polygon of polygons(layer.area))
        neighbours.current.push(
          new maps.Polygon({
            map: mapRef.current,
            paths: mapPaths(polygon),
            clickable: false,
            fillColor: layer.colour,
            fillOpacity: layer.town ? 0 : 0.12,
            strokeColor: layer.colour,
            strokeWeight: layer.town ? 3 : 1,
            zIndex: layer.town ? 1 : 2,
          }),
        );
    }
    return () => removeShapes(neighbourShapes, maps);
  }, [maps, townArea, zones, editingId, townColour, neighbourColour]);

  useEffect(() => {
    if (!maps || !mapRef.current) return;
    const serialized = JSON.stringify({ value, colour: activeColour });
    if (!drawing && renderedValue.current === serialized && selected.current.length > 0) return;
    removeShapes(selected.current, maps);
    renderedValue.current = serialized;
    if (!value || drawing) return;
    for (const polygon of polygons(value))
      selected.current.push(
        new maps.Polygon({
          map: mapRef.current,
          paths: mapPaths(polygon),
          editable: true,
          strokeColor: activeColour,
          fillColor: activeColour,
          fillOpacity: 0.22,
          strokeWeight: 2,
          zIndex: 3,
        }),
      );
    const sync = () => {
      const coordinates = selected.current.map((shape) =>
        shape
          .getPaths()
          .getArray()
          .map((path) =>
            closeRing(path.getArray().map((point): Position => [point.lng(), point.lat()])),
          ),
      );
      const area: GeoArea =
        value.type === 'MultiPolygon'
          ? { type: 'MultiPolygon', coordinates }
          : { type: 'Polygon', coordinates: coordinates[0]! };
      renderedValue.current = JSON.stringify({ value: area, colour: activeColour });
      changeRef.current(area);
    };
    // Every listener is owned by this run, so the next run (or unmount) removes
    // exactly these and none of them outlive the shapes they edit.
    const listeners: google.maps.MapsEventListener[] = [];
    for (const shape of selected.current)
      shape.getPaths().forEach((path) => {
        for (const event of ['insert_at', 'set_at', 'remove_at'])
          listeners.push(path.addListener(event, sync));
      });
    return () => {
      for (const listener of listeners) listener.remove();
    };
  }, [maps, value, drawing, activeColour]);

  useEffect(() => {
    if (!maps || !mapRef.current) return;
    mapRef.current.setOptions({
      draggableCursor: drawing ? 'crosshair' : null,
      disableDoubleClickZoom: drawing,
    });
    if (!drawing) return;
    const line = new maps.Polyline({
      map: mapRef.current,
      path: corners.map(([lng, lat]) => ({ lat, lng })),
      strokeColor: activeColour,
      strokeWeight: 3,
      clickable: false,
      zIndex: 4,
    });
    const listener = mapRef.current.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (event.latLng) {
        const point: Position = [event.latLng.lng(), event.latLng.lat()];
        setCorners((current) => [...current, point]);
      }
    });
    return () => {
      listener.remove();
      line.setMap(null);
    };
  }, [maps, drawing, corners, activeColour]);

  function setDrawingMode(next: boolean) {
    setDrawing(next);
    onDrawingChange(next);
  }

  function finish() {
    if (corners.length < 3) return;
    onChange({ type: 'Polygon', coordinates: [closeRing(corners)] });
    setDrawingMode(false);
    setCorners([]);
  }

  if (!appConfig.googleMapsApiKey)
    return (
      <Alert severity="info">
        The map has not been enabled yet. You can still enter a boundary under Advanced settings.
      </Alert>
    );

  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        The highlighted shape is this zone. Muted shapes are neighbouring zones; the dark outline is
        the town boundary. Use the map control to switch between streets and satellite imagery.
      </Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap' }} spacing={1}>
        {drawing ? (
          <>
            <Button onClick={finish} disabled={corners.length < 3} variant="contained">
              Finish boundary
            </Button>
            <Button
              onClick={() => setCorners((current) => current.slice(0, -1))}
              disabled={corners.length === 0}
            >
              Undo corner
            </Button>
            <Button
              onClick={() => {
                setDrawingMode(false);
                setCorners([]);
              }}
            >
              Cancel drawing
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => {
                setCorners([]);
                setDrawingMode(true);
              }}
              disabled={!maps || Boolean(error)}
              variant="outlined"
            >
              {value ? 'Redraw boundary' : 'Draw boundary'}
            </Button>
            <Button onClick={() => onChange(null)} disabled={!value || !maps}>
              Clear boundary
            </Button>
          </>
        )}
      </Stack>
      <Typography variant="body2" aria-live="polite">
        {drawing
          ? `Click or tap the map to add corners (${corners.length} added), then finish the boundary.`
          : value
            ? 'Drag corners to adjust the boundary. Drag an edge handle to add a corner.'
            : 'Choose Draw boundary to outline this area.'}
      </Typography>
      {error && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              onClick={() => {
                setError('');
                setMaps(null);
                setAttempt((current) => current + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      <Box sx={{ position: 'relative' }}>
        {!maps && !error && (
          <Stack direction="row" spacing={1} sx={{ py: 2 }}>
            <CircularProgress size={20} />
            <Typography>Loading map…</Typography>
          </Stack>
        )}
        <Box
          ref={container}
          role="region"
          aria-label="Zone boundary map"
          sx={{ height: { xs: 340, sm: 440 }, borderRadius: 1, border: 1, borderColor: 'divider' }}
        />
      </Box>
    </Stack>
  );
}
