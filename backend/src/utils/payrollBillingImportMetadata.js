// Symbols carry source identity only inside the import process. JSON payroll
// responses and raw payroll rows never expose the client profile payload.
const PROFILE_SOURCE = Symbol('payrollBillingProfileSource');

export function billingImportMetadata(metadata) {
  return { [PROFILE_SOURCE]: metadata };
}

export function copyBillingImportMetadata(row) {
  return row?.[PROFILE_SOURCE] ? billingImportMetadata(row[PROFILE_SOURCE]) : {};
}

export function getBillingImportMetadata(row) {
  return row?.[PROFILE_SOURCE] || null;
}
