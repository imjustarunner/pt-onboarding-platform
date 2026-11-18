export const DEFAULT_NARRIVA_SERVICE_GENERATORS = Object.freeze({
  '90791': 'clinical_90791_intake_plan',
  '90832': 'clinical_psychotherapy_note', '90834': 'clinical_psychotherapy_note', '90837': 'clinical_psychotherapy_note', '90839': 'clinical_psychotherapy_note',
  '90846': 'clinical_family_note', '90847': 'clinical_family_note',
  H0002: 'clinical_screening_review', H0004: 'clinical_h0004_note', H0031: 'clinical_h0031_intake',
  H0032: 'clinical_h0032_plan_development', H2011: 'clinical_h2011_note', H0023: 'clinical_h0023_full_packet', H2014: 'clinical_h2014_individual',
  'H2014:group': 'clinical_h2014_group', H2015: 'clinical_h2014_individual', H2016: 'clinical_h2014_individual'
});

const fail = message => Object.assign(new Error(message), { status: 400 });
export function normalizeNarrivaConfiguration(input = {}, toolIds = []) {
  const allowed = new Set(toolIds);
  const mappings = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Generator settings must be an object.');
  for (const [key, value] of Object.entries(input.mappings || {})) {
    const code = key.trim().toUpperCase().replace(/:(GROUP|INDIVIDUAL)$/, suffix => suffix.toLowerCase());
    if (!/^[A-Z0-9][A-Z0-9 _./-]{0,39}(?::(?:group|individual))?$/.test(code)) throw fail('Use a service code, optionally followed by :group or :individual.');
    const id = value == null || value === '' ? null : String(value).trim();
    if (id && !allowed.has(id)) throw fail(`Unknown Narriva generator for ${code}.`);
    mappings[code] = id;
  }
  const generators = {};
  for (const [id, raw] of Object.entries(input.generators || {})) {
    if (!allowed.has(id)) throw fail('An unknown Narriva generator was supplied.');
    const instructions = String(raw?.instructions || '').trim();
    if (instructions.length > 20000) throw fail('Writing instructions may contain up to 20,000 characters per generator.');
    const examples = (Array.isArray(raw?.examples) ? raw.examples : []).map(example => ({
      input: String(example?.input || '').trim(), output: String(example?.output || '').trim()
    })).filter(example => example.input || example.output);
    if (examples.length > 8 || examples.some(example => !example.input || !example.output || example.input.length > 12000 || example.output.length > 20000)) throw fail('Provide up to eight complete fictional input/output examples per generator.');
    if (examples.length && raw?.syntheticConfirmed !== true) throw fail('Confirm that writing examples are fictional or deidentified.');
    generators[id] = { instructions, examples, syntheticConfirmed: examples.length > 0 };
  }
  return { mappings, generators };
}

export function resolveNarrivaGenerator({ serviceCode, sessionMode = 'individual' } = {}, configuration = {}) {
  const code = String(serviceCode || '').trim().toUpperCase();
  const keys = [`${code}:${sessionMode === 'group' ? 'group' : 'individual'}`, code];
  for (const key of keys) if (Object.hasOwn(configuration.mappings || {}, key)) return configuration.mappings[key] || null;
  for (const key of keys) if (Object.hasOwn(DEFAULT_NARRIVA_SERVICE_GENERATORS, key)) return DEFAULT_NARRIVA_SERVICE_GENERATORS[key];
  return null;
}

export function addNarrivaWritingGuidance({ prompt, toolId, configuration = {} }) {
  const guidance = configuration.generators?.[toolId];
  if (!guidance?.instructions && !guidance?.examples?.length) return prompt;
  return [prompt, 'Platform writing guidance (style and organization only):',
    'The original clinical facts, privacy rules, confirmed content, and required output headers take precedence. Examples are fictional style references, never facts about this client. Do not invent consent, diagnoses, risk findings, participant presence, baseline ratings or outcomes.',
    JSON.stringify({ instructions: guidance.instructions || '', fictionalExamples: guidance.examples || [] })].join('\n\n');
}
