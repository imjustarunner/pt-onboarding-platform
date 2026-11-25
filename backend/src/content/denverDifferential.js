// ITSCO Workplace Handbook: Denver differential per Workload Clinical Hour.
export const STANDARD_DENVER_DIFFERENTIAL = Object.freeze({ 1: 0, 2: 1, 3: 2 });

export function denverDifferentialRates(profile) {
  const configured = profile?.locationBonus;
  return Object.values(configured || {}).some(rate => Number(rate) > 0)
    ? { ...STANDARD_DENVER_DIFFERENTIAL, ...configured }
    : { ...STANDARD_DENVER_DIFFERENTIAL };
}
