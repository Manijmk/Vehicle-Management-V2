export function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const placeholders = new Set<string>();
  for (const match of matches) {
    if (match[1]) {
      placeholders.add(match[1]);
    }
  }
  return Array.from(placeholders);
}

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) {
      return '';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  });
}
