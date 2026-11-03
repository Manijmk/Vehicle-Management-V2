import { NotificationTemplateRenderError } from './notification-errors.js';

export interface RenderTemplateOptions {
  /** If true, string values are HTML-entity-encoded to prevent XSS in email/web HTML context */
  readonly escapeHtml?: boolean;
}

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/**
 * Extracts all unique placeholder variable names from a template string.
 * Placeholder pattern: {{variableName}} where variableName is alphanumeric + underscore.
 */
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

/**
 * Strictly interpolates a template using a dictionary of variables.
 * Disallows arbitrary JavaScript, expression evaluation, or dynamic code.
 *
 * Throws NotificationTemplateRenderError if any required placeholder is missing.
 */
export function renderTemplate(
  template: string,
  variables: Readonly<Record<string, string | number | boolean | null | undefined>>,
  options: RenderTemplateOptions = {},
): string {
  if (typeof template !== 'string') {
    throw new NotificationTemplateRenderError('Template must be a string');
  }

  const requiredPlaceholders = extractPlaceholders(template);
  const missingVariables: string[] = [];

  for (const placeholder of requiredPlaceholders) {
    const value = variables[placeholder];
    if (value === undefined || value === null) {
      missingVariables.push(placeholder);
    }
  }

  if (missingVariables.length > 0) {
    throw new NotificationTemplateRenderError(
      `Missing required template variables: ${missingVariables.join(', ')}`,
      missingVariables,
    );
  }

  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, varName: string) => {
    const rawVal = variables[varName];
    const strVal = String(rawVal ?? '');
    return options.escapeHtml ? escapeHtml(strVal) : strVal;
  });
}
