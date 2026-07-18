import { describe, it, expect } from 'bun:test';
import { GENERIC_HARNESS, PARAMETER_KEYS } from '../src/configs/types';
import { hashConfig, diffConfigs, cloneConfig, getConfigValue, setConfigValue, getGenericConfig } from '../src/configs/config';
import { generateNeighbors } from '../src/mutations/mutations';

describe('HarnessConfig', () => {
  it('generic harness is valid', () => {
    const config = getGenericConfig();
    expect(config.prompt.instructionStyle).toBe('contract');
    expect(config.planning.mode).toBe('implicit');
    expect(config.retry.retries).toBe(1);
  });

  it('has 37 configurable parameters', () => {
    expect(PARAMETER_KEYS.length).toBe(37);
  });
});

describe('hashConfig', () => {
  it('produces same hash for same config', () => {
    const a = getGenericConfig();
    const b = cloneConfig(a);
    expect(hashConfig(a)).toBe(hashConfig(b));
  });

  it('produces different hash for different configs', () => {
    const a = getGenericConfig();
    const b = setConfigValue(a, 'prompt.instructionStyle', 'minimal');
    expect(hashConfig(a)).not.toBe(hashConfig(b));
  });

  it('hash is deterministic across calls', () => {
    const config = getGenericConfig();
    const h1 = hashConfig(config);
    const h2 = hashConfig(config);
    expect(h1).toBe(h2);
  });
});

describe('diffConfigs', () => {
  it('returns empty for identical configs', () => {
    const a = getGenericConfig();
    const diffs = diffConfigs(a, cloneConfig(a));
    expect(diffs.length).toBe(0);
  });

  it('detects changed parameters', () => {
    const a = getGenericConfig();
    const b = setConfigValue(a, 'retry.retries', 2);
    const diffs = diffConfigs(a, b);
    expect(diffs.length).toBe(1);
    expect(diffs[0]!.key).toBe('retry.retries');
    expect(diffs[0]!.before).toBe(1);
    expect(diffs[0]!.after).toBe(2);
  });
});

describe('getConfigValue / setConfigValue', () => {
  it('gets nested config values', () => {
    const config = getGenericConfig();
    expect(getConfigValue(config, 'retry.retries')).toBe(1);
    expect(getConfigValue(config, 'prompt.instructionStyle')).toBe('contract');
  });

  it('sets values immutably', () => {
    const a = getGenericConfig();
    const b = setConfigValue(a, 'retry.retries', 2);
    expect(getConfigValue(a, 'retry.retries')).toBe(1); // unchanged
    expect(getConfigValue(b, 'retry.retries')).toBe(2);
  });
});

describe('generateNeighbors', () => {
  it('generates neighbors for all parameters', () => {
    const config = getGenericConfig();
    const neighbors = generateNeighbors(config);

    // Should be roughly: sum(len(values) - 1) across all params
    // Most params have 2-3 values, so ~37 * 1.5 ≈ 55-60 neighbors
    expect(neighbors.length).toBeGreaterThan(30);
    expect(neighbors.length).toBeLessThan(100);
  });

  it('each neighbor differs by exactly one parameter', () => {
    const config = getGenericConfig();
    const neighbors = generateNeighbors(config);

    for (const neighbor of neighbors) {
      const diffs = diffConfigs(config, neighbor);
      expect(diffs.length).toBe(1);
    }
  });
});
