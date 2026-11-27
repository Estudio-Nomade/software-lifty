/**
 * @jest-environment node
 */
import { createSmoother } from '../../lib/locationSmoother';

const M_PER_DEG = 111_320;
const T0 = 1_700_000_000_000;

function spreadM(values: number[]): number {
  return (Math.max(...values) - Math.min(...values)) * M_PER_DEG;
}

describe('createSmoother', () => {
  it('passes the first fix through unchanged', () => {
    const s = createSmoother();
    expect(s.update({ lat: -31.9, lng: -65.1, accuracy: 10, timestamp: T0 })).toEqual({
      lat: -31.9,
      lng: -65.1,
    });
  });

  it('reduces jitter on a stationary series', () => {
    const s = createSmoother();
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 20; i++) {
      const noise = (i % 2 === 0 ? 1 : -1) * (5 + (i % 3)) / M_PER_DEG; // ±5-7 m
      raw.push(-31.9 + noise);
      out.push(s.update({ lat: -31.9 + noise, lng: -65.1, accuracy: 10, timestamp: T0 + i * 1000 }).lat);
    }
    expect(spreadM(out.slice(5))).toBeLessThan(spreadM(raw.slice(5)));
  });

  it('trusts an accurate fix more than an inaccurate one', () => {
    const move = 50 / M_PER_DEG;
    const tight = createSmoother();
    tight.update({ lat: -31.9, lng: -65.1, accuracy: 10, timestamp: T0 });
    const a = tight.update({ lat: -31.9 + move, lng: -65.1, accuracy: 5, timestamp: T0 + 1000 });
    const loose = createSmoother();
    loose.update({ lat: -31.9, lng: -65.1, accuracy: 10, timestamp: T0 });
    const b = loose.update({ lat: -31.9 + move, lng: -65.1, accuracy: 100, timestamp: T0 + 1000 });
    expect(a.lat - -31.9).toBeGreaterThan(b.lat - -31.9);
  });

  it('reset() makes the next fix pass through', () => {
    const s = createSmoother();
    s.update({ lat: -31.9, lng: -65.1, accuracy: 10, timestamp: T0 });
    s.reset();
    expect(s.update({ lat: -30, lng: -60, accuracy: 10, timestamp: T0 + 1000 })).toEqual({
      lat: -30,
      lng: -60,
    });
  });

  it('a gap over 30 s resets the filter', () => {
    const s = createSmoother();
    s.update({ lat: -31.9, lng: -65.1, accuracy: 10, timestamp: T0 });
    expect(s.update({ lat: -31.8, lng: -65.0, accuracy: 10, timestamp: T0 + 31_000 })).toEqual({
      lat: -31.8,
      lng: -65.0,
    });
  });
});
