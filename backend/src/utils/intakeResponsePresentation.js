export function readableIntakeKey(key) {
  if (String(key || '').replace(/[^a-z]/gi, '').toLowerCase() === 'clinicalsafetyalert') return 'Clinical safety alert';
  return String(key || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase().replace(/^./, letter => letter.toUpperCase());
}
export function readableIntakeValue(value, field) {
  const option = (field?.options || []).find(item => String(item.value ?? item) === String(value));
  if (option) return String(option.label ?? option.value ?? option);
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  const choices = { going_well: 'Going well', needs_attention: 'Needs attention', not_applicable: 'Not applicable', prefer_not_to_answer: 'Prefer not to answer' };
  return choices[String(value)] || String(value ?? '').trim();
}
export function flattenIntakeFields(fields = [], steps = []) {
  const byKey = new Map((fields || []).filter(field => field?.key).map(field => [field.key, field]));
  const visit = list => { for (const step of list || []) { for (const field of step.fields || []) if (field?.key) byKey.set(field.key, field); if (Array.isArray(step.steps)) visit(step.steps); } };
  visit(steps); return [...byKey.values()];
}
