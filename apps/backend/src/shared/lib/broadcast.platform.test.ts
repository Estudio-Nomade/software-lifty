import { describe, expect, test } from 'bun:test';
import { PLATFORM_REALTIME_TOPIC } from './broadcast';

describe('platform realtime topic', () => {
  test('stable shared topic for admin config broadcasts', () => {
    expect(PLATFORM_REALTIME_TOPIC).toBe('platform:config');
  });
});
