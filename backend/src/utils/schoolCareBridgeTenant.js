export function isSchoolCareBridgeOnly(agency) {
  let flags = agency?.feature_flags || agency?.featureFlags || {};
  try { if (typeof flags === 'string') flags = JSON.parse(flags); } catch { return false; }
  return flags?.schoolCareBridgeOnly === true;
}
