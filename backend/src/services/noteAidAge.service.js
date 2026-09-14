function civilDate(value) {
  const raw = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value || '').slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, raw };
}

export function ageAtServiceDate(dob, serviceDate) {
  const birth = civilDate(dob);
  const service = civilDate(serviceDate);
  if (!birth || !service || birth.raw > service.raw) return null;
  const age = service.year - birth.year - (service.month < birth.month || service.month === birth.month && service.day < birth.day ? 1 : 0);
  return age >= 0 && age <= 120 ? age : null;
}

export function intakeAgeInstruction(age) {
  return age == null ? '' : `Chart-derived age at this encounter: ${age} years. Use this age in Identification for this intake/re-intake. Older pasted notes may contain a historical age; do not use that as the current age. Preserve explicitly historical ages in the history. Do not output the birthdate.`;
}

/** Correct the identifying age locally even if the model repeats an old intake's age. */
export function applyIntakeIdentifyingAge(sections, age) {
  if (age == null) return sections;
  const name = Object.keys(sections).find((k) => /^(identification|identifying information|identifying data)$/i.test(k));
  if (!name) return sections;
  const text = String(sections[name] || '');
  const currentAge = /\b((?:(?:the )?(?:client|patient)(?: is| presents as)?|(?:he|she|they) (?:is|are))\s+(?:(?:a|an)\s+)?)\d{1,3}([ -]year[ -]old| years old)\b/gi;
  const corrected = text.replace(currentAge, (_m, before, after) => `${before}${age}${after}`)
    .replace(/^(\s*(?:age|current age)\s*:\s*)\d{1,3}\b/gim, `$1${age}`)
    .replace(/^(\s*(?:a|an)?\s*)\d{1,3}([ -]year[ -]old)\b/i, `$1${age}$2`);
  return { ...sections, [name]: /^Age at date of service:/i.test(corrected)
    ? corrected.replace(/^Age at date of service:.*\n?/, `Age at date of service: ${age} years.\n`)
    : `Age at date of service: ${age} years.\n${corrected}` };
}
