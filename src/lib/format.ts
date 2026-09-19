import type { Row } from './types';

export function clientName(client: Row) {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const person = [clean(client.FirstName), clean(client.LastName)].filter(Boolean).join(' ');
  return (client.IsClientACompany ? clean(client.Company) : person) || clean(client.Company) || person || clean(client.ClientRef) || 'Unnamed client';
}
export function clientInitials(client: Row) {
  const words = clientName(client).split(/\s+/);
  return (Array.from(words[0])[0] + (words.length > 1 ? Array.from(words.at(-1)!)[0] : '')).toLocaleUpperCase();
}

export const list = <T = Record<string, any>>(value: unknown): T[] => Array.isArray(value) ? value : [];
export const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function money(value: number | null | undefined, currency = 'CHF', compact = false) {
  if (value == null || !Number.isFinite(value)) return 'Not available';
  const digits = compact ? 1 : 0;
  const formatted = new Intl.NumberFormat('en-CH', { maximumFractionDigits: digits, ...(compact ? { notation: 'compact' as const } : {}) }).format(value);
  return `${currency} ${formatted}`;
}
export const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
export function dateLabel(value?: string, short = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Date not recorded';
  // Preserve the source's calendar day; profiling dates are not timezone-conversion events.
  const calendarDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0,10)}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }).format(calendarDate);
}
export const statusLabel = (status?: string) => ({ Abgelehnt: 'Rejected', Entwurf: 'Draft', Final: 'Final', Finalized: 'Final' }[status ?? ''] ?? status ?? 'Status unavailable');
export function redact(text: unknown) {
  return String(text ?? '').replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g, '[account redacted]');
}
export const shortName = (name: string, length = 48) => name.length > length ? `${name.slice(0, length - 1)}…` : name;
