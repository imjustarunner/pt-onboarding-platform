export const CHILDCARE_BANDS = [1, 2, 3, 4];

export function resolvedChildcareBands({ category, level, policy, overrides = {}, flatRate = null }) {
  const schedule = Number(category) === 1 ? policy?.category1 : policy?.category2AndAbove;
  const base = schedule?.[Number(level) - 1];
  return Object.fromEntries(CHILDCARE_BANDS.map(band => {
    const override = overrides?.[band];
    const value = override !== '' && override != null ? Number(override)
      : flatRate !== '' && flatRate != null ? Number(flatRate)
        : base != null && policy?.additionalChildAmounts?.[band - 1] != null
          ? Number(base) + Number(policy.additionalChildAmounts[band - 1]) : null;
    return [band, Number.isFinite(value) && value > 0 ? value : null];
  }));
}

export function childcareCountPayload(choice, actual, planned) {
  if (choice === 'planned') return { confirmPlannedCount: true, actualChildren: Number(planned) };
  if (choice === 'actual' && String(actual).trim() !== '' && Number.isSafeInteger(Number(actual)) && Number(actual) >= 0) {
    return { confirmPlannedCount: false, actualChildren: Number(actual) };
  }
  if (choice === 'later') return {};
  throw new Error('Confirm the planned count, enter the actual count, or choose to review attendance later.');
}

export function childcareMoney(value) {
  return value != null && Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value)) : 'Review required';
}
