import { describe, expect, test } from 'bun:test';
import { diffConfigs } from '../configs/config';
import { GENERIC_HARNESS } from '../configs/types';
import { generateRandomConfig } from './mutations';

describe('generateRandomConfig', () => {
  test('uses the generic harness by default and mutates it reproducibly', () => {
    const first = generateRandomConfig(undefined, 42);
    const second = generateRandomConfig(undefined, 42);

    expect(first).toEqual(second);
    expect(diffConfigs(GENERIC_HARNESS, first).length).toBeGreaterThanOrEqual(1);
  });

  test('does not mutate the supplied base configuration', () => {
    const base = structuredClone(GENERIC_HARNESS);
    const result = generateRandomConfig(base, 7);

    expect(base).toEqual(GENERIC_HARNESS);
    expect(result).not.toBe(base);
  });
});
