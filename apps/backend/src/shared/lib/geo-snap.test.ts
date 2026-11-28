import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { snapToRoad } from './geo';

const raw = { lat: -31.9456, lng: -65.1895 };
const nearest = (lat: number, lng: number, distance: number) =>
  new Response(JSON.stringify({ code: 'Ok', waypoints: [{ location: [lng, lat], distance }] }), {
    status: 200,
  });

let fetchSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  fetchSpy = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchSpy.mockRestore());

describe('snapToRoad', () => {
  test('snaps when the road is within max(accuracy, 15) m', async () => {
    fetchSpy.mockResolvedValue(nearest(-31.94553, -65.1895, 8));
    const out = await snapToRoad(raw.lat, raw.lng, 10);
    expect(out).toEqual({ lat: -31.94553, lng: -65.1895 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain(`/nearest/v1/driving/${raw.lng},${raw.lat}`);
  });

  test('keeps the raw point when the road is 80 m away and accuracy is 10', async () => {
    fetchSpy.mockResolvedValue(nearest(-31.9449, -65.1895, 80));
    expect(await snapToRoad(raw.lat, raw.lng, 10)).toEqual(raw);
  });

  test('returns the raw point on HTTP 500', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    expect(await snapToRoad(raw.lat, raw.lng, 10)).toEqual(raw);
  });

  test('returns the raw point when fetch aborts / times out', async () => {
    fetchSpy.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    expect(await snapToRoad(raw.lat, raw.lng, 10)).toEqual(raw);
  });
});
