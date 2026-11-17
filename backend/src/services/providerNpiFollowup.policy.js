export const NPI_STATUS_FIELDS = ['provider_identity_npi_status', 'npi_status'];
// npi_id is an account/reference ID, not the provider's NPI number.
export const NPI_NUMBER_FIELDS = ['provider_identity_npi_number', 'npi_number', 'provider_npi_number', 'provider_npi', 'npi', 'lifecycle_npi_number'];
export const NPI_FOLLOWUP_SOURCE = 'provider_npi_followup';
export const NPI_AUTOMATION = 'provider_npi_credentialing_automation';

export function validIndividualNpi(value) {
  const npi = String(value || '').trim();
  if (!/^[12]\d{9}$/.test(npi)) return false;
  return [...`80840${npi}`].reverse().reduce((sum, digit, index) => {
    const n = Number(digit) * (index % 2 ? 2 : 1);
    return sum + (n > 9 ? n - 9 : n);
  }, 0) % 10 === 0;
}

function bestValue(entries, keys) {
  for (const key of keys) {
    const match = entries.filter(e => e.field_key === key && String(e.value ?? '').trim())
      .sort((a, b) => (new Date(b.updated_at || 0) - new Date(a.updated_at || 0)) || Number(b.id || 0) - Number(a.id || 0))[0];
    if (match) return String(match.value).trim();
  }
  return '';
}

export function providerNpiState(entries = []) {
  const answer = bestValue(entries, NPI_STATUS_FIELDS);
  const number = bestValue(entries, NPI_NUMBER_FIELDS);
  const requestedHelp = /make me one|no_itsco_create/i.test(answer);
  const numbers = new Set(NPI_NUMBER_FIELDS.map(key => bestValue(entries, [key])).filter(Boolean));
  let state, action;
  if (numbers.size > 1) {
    state = 'conflicting_npi'; action = 'Verify conflicting NPI records and save the correct individual NPI.';
  } else if (validIndividualNpi(number)) {
    state = 'recorded'; action = 'NPI recorded; verify provider identity and payer enrollment separately.';
  } else if (number) {
    state = 'invalid_npi'; action = 'Verify the recorded NPI and correct its format or checksum.';
  } else if (requestedHelp) {
    state = 'help_requested'; action = 'Contact the provider and help obtain an individual NPI. Confirm no NPI already exists before applying.';
  } else if (/registered|surrogate/i.test(answer)) {
    state = 'registration_pending'; action = 'Follow up on the existing registration and record the individual NPI. Confirm before starting another application.';
  } else if (/^yes$/i.test(answer) || /^yes\b/i.test(answer)) {
    state = 'existing_number_missing'; action = 'The provider says they have an NPI. Obtain and record that number; do not start a duplicate application.';
  } else if (/^no$/i.test(answer)) {
    state = 'no_npi_reported'; action = 'Confirm whether the provider needs help obtaining an NPI, then record the number when issued.';
  } else {
    state = 'answer_missing'; action = 'Ask whether the provider already has an NPI or needs assistance. A blank answer is not a request to create one.';
  }
  return { state, answer, number, requestedHelp, action, complete: state === 'recorded' };
}

export function npiTaskContent(provider, state) {
  const name = [provider.first_name, provider.last_name].filter(Boolean).join(' ');
  const prefix = state.state === 'help_requested' ? 'Help obtain NPI' : 'Review NPI readiness';
  return {
    title: `${prefix}: ${name}`.slice(0, 255),
    description: `${state.action}\n\nProvider: ${name}\nAgency: ${provider.agency_name}\nAccount stage: ${provider.status}\nNPI answer: ${state.answer || 'Not answered'}\n\nRecord the NPI in the provider profile. This credentialing follow-up closes when a number with a valid format and checksum is recorded. Recording a number does not verify identity, NPPES enumeration type, or payer enrollment.`,
    metadata: { source: NPI_FOLLOWUP_SOURCE, automation: NPI_AUTOMATION, actorType: 'automation',
      providerUserId: Number(provider.id), agencyId: Number(provider.agency_id),
      npiState: state.state, npiAnswer: state.answer, accountStatus: provider.status,
      requestedHelp: state.requestedHelp, action: state.action }
  };
}
