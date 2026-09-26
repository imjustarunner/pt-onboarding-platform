export const taxIdDigits = value => String(value ?? '').replace(/\D/g, '');
/** Presentation only: never truncate an invalid ID or change its leading zeros. */
export function formatTaxId(value, type = 'ein') {
  const digits = taxIdDigits(value);
  const cuts = type === 'ssn' ? [3, 5] : [2];
  return [...digits].map((digit, index) => `${cuts.includes(index) ? '-' : ''}${digit}`).join('');
}
