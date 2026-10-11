import { describe, expect, it } from 'vitest';
import type { GeoArea } from '@/api/dto/common';
import { zones } from '@/mocks/fixtures';
import {
  checkZoneBoundary,
  closeRing,
  suggestZoneCode,
} from '@/features/configuration/zoneBoundary';
import { parseGeoArea } from '@/features/configuration/geojson';

const square = (x: number, y: number, size = 1): GeoArea => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});
const town = square(0, 0, 10);

describe('zone map geometry', () => {
  it('suggests stable readable codes and resolves collisions', () => {
    expect(suggestZoneCode('Empumalanga', ['EMPUMALANGA', 'EMPUMALANGA_2'])).toBe('EMPUMALANGA_3');
    expect(suggestZoneCode('Town centre / CBD', [])).toBe('TOWN_CENTRE_CBD');
    expect(suggestZoneCode('  ', [])).toBe('');
  });
  it('closes map paths without repeating the last point twice', () => {
    expect(
      closeRing([
        [1, 2],
        [3, 4],
        [5, 6],
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [1, 2],
    ]);
    expect(
      closeRing([
        [1, 2],
        [3, 4],
        [1, 2],
      ]),
    ).toHaveLength(3);
  });
  it('distinguishes actual overlap from touching edges and excludes disabled/current zones', () => {
    const existing = { ...zones[0]!, id: 'neighbour', polygon: square(1, 1, 2) };
    expect(checkZoneBoundary(square(3, 1), town, [existing]).overlaps).toEqual([]);
    expect(checkZoneBoundary(square(2, 2), town, [existing]).overlaps).toEqual([existing]);
    expect(checkZoneBoundary(square(2, 2), town, [existing], 'neighbour').overlaps).toEqual([]);
    expect(
      checkZoneBoundary(square(2, 2), town, [{ ...existing, status: 'DISABLED' }]).overlaps,
    ).toEqual([]);
  });
  it('rejects crossing lines and finds outside areas through holes', () => {
    expect(
      checkZoneBoundary(
        {
          type: 'Polygon',
          coordinates: [
            [
              [1, 1],
              [3, 3],
              [1, 3],
              [3, 1],
              [1, 1],
            ],
          ],
        },
        town,
        [],
      ).error,
    ).toMatch(/cross/);
    const withHole: GeoArea = {
      type: 'Polygon',
      coordinates: [
        (town as Extract<GeoArea, { type: 'Polygon' }>).coordinates[0]!,
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    };
    expect(checkZoneBoundary(square(3, 3, 4), withHole, []).outsideTown).toBe(true);
  });
  it('refuses empty geometry in the advanced editor', () => {
    expect(parseGeoArea('{"type":"Polygon","coordinates":[]}').ok).toBe(false);
    expect(parseGeoArea('{"type":"MultiPolygon","coordinates":[[]]}').ok).toBe(false);
  });
});
