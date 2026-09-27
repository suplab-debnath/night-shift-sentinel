// Small pure formatting helpers shared by engine, UI, and server.

/** Render tool args the way the script writes them: {service:"checkout-api", window:"15m"}. */
export function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => `${k}:${formatValue(v)}`);
  return `{${parts.join(', ')}}`;
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (typeof v === 'object' && v !== undefined) return formatArgs(v as Record<string, unknown>);
  return String(v);
}

export type Placeholders = Record<string, string | undefined>;

const PLACEHOLDER = /\{\{\s*([A-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g;

/** True when a branding value is unset or still a literal placeholder. */
export function isUnfilled(value: string | undefined): boolean {
  return value === undefined || value.trim() === '' || /^\{\{.*\}\}$/.test(value.trim());
}

/**
 * Resolve {{KEY}} and {{KEY|fallback}}. Unfilled keys with a fallback use it;
 * unfilled keys without one stay visible so they are caught in review.
 */
export function fillPlaceholders(text: string, values: Placeholders): string {
  return text.replace(PLACEHOLDER, (whole, key: string, fallback: string | undefined) => {
    const v = values[key];
    if (!isUnfilled(v)) return v as string;
    return fallback !== undefined ? fallback : whole;
  });
}
