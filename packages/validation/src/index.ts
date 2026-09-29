import { z } from 'zod';

export const nonEmptyTrimmedString = z.string().trim().min(1);

export const organizationIdSchema = z.uuid();

export function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
