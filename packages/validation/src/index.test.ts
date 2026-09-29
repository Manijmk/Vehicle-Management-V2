import { describe, expect, it } from 'vitest';

import { nonEmptyTrimmedString, parseCommaSeparated } from './index.js';

describe('shared validation', () => {
  it('normalizes non-empty text', () => {
    expect(nonEmptyTrimmedString.parse('  fleet  ')).toBe('fleet');
  });

  it('parses a clean comma-separated list', () => {
    expect(parseCommaSeparated('first, second, ,third')).toEqual(['first', 'second', 'third']);
  });
});
