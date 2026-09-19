/** ISO 6166 syntax and check digit. A valid identifier still needs provider resolution. */
export function isValidIsin(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)) return false;
  const digits = [...value].map(c => parseInt(c, 36).toString()).join('').split('').reverse().map(Number);
  return digits.reduce((sum, n, i) => sum + (i % 2 ? Math.floor(n * 2 / 10) + n * 2 % 10 : n), 0) % 10 === 0;
}
