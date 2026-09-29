// Organization-requested defaults, not an assertion of a payer's contract terms.
export function defaultSuperviseeBillingAllowed(...names) {
  return !names.some(name => /tricare|triwest/.test(String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
}

export function superviseeBillingAllowed(row) {
  if (row.allow_supervisee_billing != null) return Number(row.allow_supervisee_billing) === 1;
  return defaultSuperviseeBillingAllowed(row.name, row.insurance_name, row.parent_name, row.billing_payer_name, row.directory_name);
}

export function validateSuperviseeBillingInput(value) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw Object.assign(new Error('Supervisee billing eligibility must be a checkbox value'), { status: 400 });
  }
  return value;
}
