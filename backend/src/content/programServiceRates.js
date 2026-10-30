/** Program compensation is separate from clinical credits and general H-code pay. */
export const PROGRAM_RATE_VERSION = 'program-service-rates-2026-10-29';
export const PROGRAM_PROBATION_DAYS = 60;
export const PROGRAM_RATE_SCHEDULES = Object.freeze({
  homework_help: { label: 'Homework Help', field: 'homeworkHelpRate', rates: { 1: [16,16,16,18,18], 2: [20,20,20,22,22], 3: [20,20,20,22,22] } },
  h2014: { label: 'Therapy + Tutoring · H2014', field: 'h2014Rate', rates: { 1: [18,18,18,20,20], 2: [20,20,20,22,22], 3: [20,20,20,22,22] } },
  tutoring: { label: 'Tutoring', field: 'tutoringRate', rates: { 1: [20,20,20,22,22], 2: [24,24,24,26,26], 3: [28,28,28,30,30] } }
});
export const PROGRAM_RATE_RATIONALE = 'Establish distinct compensation schedules for Homework Help, Tutoring and the eligible H2014 component of Therapy + Tutoring so payroll reflects the service actually delivered. Apply the disclosed 60-day program probation adjustment consistently for Categories 2 and 3 while preserving Category 1 rates, existing clinical and general H-code workload rules, service authorization requirements and compensation already earned.';
const tenants = new Set(['nlu','isi','tisi']);
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const isProgramServiceRole = (...labels) => /\btutor(?:ing)?\b|\bhomework\b/i.test(labels.filter(Boolean).join(' '));
export const isProgramRateTenant = tenant => tenants.has(String(tenant || '').toLowerCase());

export function programServiceForCode(serviceCode, category = '') {
  const code = String(serviceCode || '').trim().toUpperCase().replace(/[_-]/g, ' ');
  if (code === 'H2014') return 'h2014';
  if (/^HOMEWORK HELP(?: |$)/.test(code) || String(category).toLowerCase() === 'homework_help') return 'homework_help';
  if (/^TUTORING(?: |$)/.test(code) || String(category).toLowerCase() === 'tutoring') return 'tutoring';
  return null;
}

export function programServiceRate({ service, category, level, tenant, inProgramProbation = false }) {
  if (!isProgramRateTenant(tenant)) return null;
  const definition = PROGRAM_RATE_SCHEDULES[service];
  if (!definition || ![1,2,3].includes(Number(category)) || ![1,2,3,4,5].includes(Number(level))) return null;
  const base = definition.rates[Number(category)][Number(level)-1];
  return roundMoney(base * (inProgramProbation && Number(category) > 1 ? 0.85 : 1));
}

/** Only used for a newly reviewed schedule; never applied to an existing agreement. */
export function programScheduleTerms({ tenant, category, level, effectiveOn = null }) {
  if (!isProgramRateTenant(tenant)) return {};
  const terms = { programRatesVersion: PROGRAM_RATE_VERSION, programTenant: tenant === 'tisi' ? 'isi' : tenant, programProbationDays: PROGRAM_PROBATION_DAYS, ...(effectiveOn ? { programRatesEffectiveOn: effectiveOn } : {}) };
  for (const [service, definition] of Object.entries(PROGRAM_RATE_SCHEDULES)) {
    const rate = programServiceRate({ service, category, level, tenant });
    if (rate == null) throw new Error('Confirm the program compensation category and level.');
    terms[definition.field] = rate;
    terms[`${definition.field}Probation`] = programServiceRate({ service, category, level, tenant, inProgramProbation: true });
  }
  return terms;
}

export function programProbationApplies(profile, status = {}) {
  if (profile?.programRatesVersion !== PROGRAM_RATE_VERSION || !isProgramRateTenant(profile.programTenant) || Number(profile.category) === 1 || status.waiveProbation || status.inProbation === false) return false;
  if (Number.isFinite(Number(status.tenureDays)) && status.tenureDays != null) return Number(status.tenureDays) >= 0 && Number(status.tenureDays) < PROGRAM_PROBATION_DAYS;
  if (status.probationStart && status.asOfDate) {
    const days = (Date.parse(`${String(status.asOfDate).slice(0,10)}T12:00:00Z`) - Date.parse(`${String(status.probationStart).slice(0,10)}T12:00:00Z`)) / 86400000;
    return days >= 0 && days < PROGRAM_PROBATION_DAYS;
  }
  // Preview callers explicitly supply this; production status must establish tenure.
  return status.programProbationPreview === true;
}

export function programRateForProfile(profile, status, serviceCode, category = '') {
  const service = programServiceForCode(serviceCode, category);
  if (!service || profile?.programRatesVersion !== PROGRAM_RATE_VERSION || !isProgramRateTenant(profile.programTenant)) return null;
  const effectiveOn = profile.programRatesEffectiveOn || profile.agreementEffectiveOn;
  const asOf = String(status?.asOfDate || '').slice(0,10);
  if (effectiveOn && (!asOf || asOf < String(effectiveOn).slice(0,10))) return null;
  const field = PROGRAM_RATE_SCHEDULES[service].field;
  const base = Number(profile[field]);
  if (!Number.isFinite(base) || base <= 0) throw new Error(`Confirm the approved ${PROGRAM_RATE_SCHEDULES[service].label} rate.`);
  const probation = programProbationApplies(profile,status);
  const rate = probation ? Number(profile[`${field}Probation`] ?? roundMoney(base * 0.85)) : base;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Confirm the approved program probation rate.');
  return { service, rate, probation, label: PROGRAM_RATE_SCHEDULES[service].label, indirectMinutesPerHour: service === 'homework_help' ? 0 : 10 };
}

export function programRateRowsHtml(category, level, { probationWaived = false } = {}) {
  return Object.entries(PROGRAM_RATE_SCHEDULES).map(([service, definition]) => {
    const base = programServiceRate({ service, category, level, tenant:'nlu' });
    const probation = programServiceRate({ service, category, level, tenant:'nlu', inProgramProbation:!probationWaived });
    return `<tr><th scope="row">${definition.label}<br /><small>per direct-hour equivalent</small></th><td>$${base.toFixed(2)}</td><td>$${probation.toFixed(2)}</td><td>Regular program rate; no minimum-workload reduction</td></tr>`;
  }).join('');
}

export function programRatesHandbookHtml(tenant) {
  const scope = tenant === 'isi' ? 'Your selected compensation category and level determine the rates below for Homework Help, Tutoring and eligible Therapy + Tutoring H2014 services you provide. These rates are included in new individual compensation schedules. Service qualifications and payer billing requirements still apply.' : 'Use the pay type for the service actually delivered. Academic Homework Help and Tutoring are non-clinical services; H2014 applies only to eligible therapeutic skills services within the authorized Therapy + Tutoring program.';
  return `<p>${scope} Compensation category and level remain the employee’s assigned category and level.</p>` + Object.entries(PROGRAM_RATE_SCHEDULES).map(([service, definition]) => `<h3>${definition.label}</h3><table><thead><tr><th>Category</th>${[1,2,3,4,5].map(level=>`<th>Level ${level}</th>`).join('')}</tr></thead><tbody>${[1,2,3].map(category=>`<tr><th>Category ${category}</th>${[1,2,3,4,5].map(level=>`<td>$${programServiceRate({service,category,level,tenant}).toFixed(2)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('') + `<p>Amounts are hourly-equivalent base rates. For internal 15-minute records and approved H2014 units, one unit pays one quarter of the applicable hourly rate; four units equal one direct-hour equivalent. Preserve partial internal academic-service units so actual worked time is not discarded. Payer claims follow their own eligibility and unit rules. A combined Therapy + Tutoring booking does not pay both services for overlapping time; separately delivered psychotherapy retains its Clinical Session Rate.</p><h3>Program probation: first 60 calendar days</h3><p>For these three program pay types at Next Level Up and Inner Strength, Categories 2 and 3 receive 85% of the listed base rate during the first 60 calendar days of applicable new-hire probation, unless waived or ended earlier. Category 1 receives the full program rate. For example, a $24 base pays $20.40 during this period. Beginning on day 61, use the full program rate. A later assignment or amendment does not restart probation. Minimum-workload reductions and conditional clinical tier additions do not apply to these program rows. Existing Clinical Session and general Direct Care rates, probation conditions and minimum-workload rules remain unchanged. ITSCO retains its separate policy.</p><h3>Indirect work and group supplement</h3><p>Tutoring and eligible H2014 retain 10 minutes of paid indirect allowance per direct-hour equivalent, at the applicable indirect rate. Homework Help has no automatic indirect allowance; record actual compensable indirect or support work at its applicable rate. Avoid duplicate time. For NLU eligible H2014 groups with two or more actual participants, pay the session base once plus $5 per actual attendee once per session. Individual sessions receive their applicable base rate without a group addition.</p><h3>Effective dates and payroll records</h3><p>These rates apply prospectively after the required written notice or agreement and payroll effective-date setup. Preserve signed individual terms and pay already earned. The app must retain the service type, actual time, units, category, level, service date, applicable probation dates and rate used. Review separate direct-service, indirect-allowance and group-supplement records before approval. A code or rate listing does not establish service authorization or payer coverage. Applicable minimum-wage, overtime and required-waiting-time rules remain in force.</p>`;
}
