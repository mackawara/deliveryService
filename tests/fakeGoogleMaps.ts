/** Minimal Maps contract to exercise drawing/editing without API keys or billable calls. */
export class Events {
  listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  addListener(event: string, callback: (...args: unknown[]) => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(callback);
    this.listeners.set(event, list);
    return {
      remove: () =>
        this.listeners.set(
          event,
          list.filter((entry) => entry !== callback),
        ),
    };
  }
  emit(event: string, ...args: unknown[]) {
    for (const callback of this.listeners.get(event) ?? []) callback(...args);
  }
}
export class ArrayPath<T> extends Events {
  constructor(public values: T[]) {
    super();
  }
  getArray() {
    return this.values;
  }
  forEach(callback: (value: T) => void) {
    this.values.forEach(callback);
  }
  setAt(index: number, value: T) {
    this.values[index] = value;
    this.emit('set_at', index);
  }
}
const latLng = ({ lat, lng }: { lat: number; lng: number }) => ({ lat: () => lat, lng: () => lng });
export class FakeMap extends Events {
  static instances: FakeMap[] = [];
  constructor(
    public element: HTMLElement,
    public options: unknown,
  ) {
    super();
    FakeMap.instances.push(this);
  }
  fitBounds() {}
  setOptions() {}
  click(lng: number, lat: number) {
    this.emit('click', { latLng: latLng({ lng, lat }) });
  }
}
export class FakePolygon extends Events {
  static instances: FakePolygon[] = [];
  paths: ArrayPath<ArrayPath<ReturnType<typeof latLng>>>;
  map: unknown;
  constructor(
    public options: {
      paths: Array<{ lat: number; lng: number }>[];
      editable?: boolean;
      map?: unknown;
    },
  ) {
    super();
    this.map = options.map;
    this.paths = new ArrayPath(options.paths.map((ring) => new ArrayPath(ring.map(latLng))));
    FakePolygon.instances.push(this);
  }
  getPaths() {
    return this.paths;
  }
  setMap(map: unknown) {
    this.map = map;
  }
  moveCorner(index: number, lng: number, lat: number) {
    this.paths.values[0]!.setAt(index, latLng({ lng, lat }));
  }
}
class FakePolyline {
  constructor(_options: unknown) {}
  setMap() {}
}
class FakeBounds {
  extend() {}
}
export const fakeMaps = {
  Map: FakeMap,
  Polygon: FakePolygon,
  Polyline: FakePolyline,
  LatLngBounds: FakeBounds,
  event: { clearInstanceListeners: (target: Events) => target.listeners.clear() },
} as unknown as typeof google.maps;
export function resetMaps() {
  FakeMap.instances = [];
  FakePolygon.instances = [];
}
