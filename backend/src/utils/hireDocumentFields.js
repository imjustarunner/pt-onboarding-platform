// Validate the same employee fields the portal renders; never accept a signature
// as a substitute for missing answers in a payroll or employment form.
export function validateHireDocumentFields(definitions, values = {}) {
  const truthy = v => [true, 1, '1', 'true', 'yes', 'on', 'checked'].includes(v);
  for (const field of definitions || []) {
    if (field.type === 'signature' || field.autoToday || field.signerRole === 'staff' || field.signerRole === 'employer') continue;
    if (field.showIf?.fieldId) {
      const expected = field.showIf.equals;
      const actual = values[field.showIf.fieldId];
      const visible = Array.isArray(expected) ? expected.map(String).includes(String(actual)) : expected == null || expected === '' ? !!actual : String(actual ?? '') === String(expected);
      if (!visible) continue;
    }
    const value = values[field.id];
    if (field.requiredOneOf?.length && !field.requiredOneOf.some(id => String(values[id] || '').trim())) {
      throw Object.assign(new Error('Provide one of the identification numbers requested for your work authorization.'), { status: 400, statusCode: 400 });
    }
    if (field.required && (field.type === 'checkbox' ? !truthy(value) : value == null || String(value).trim() === '')) {
      throw Object.assign(new Error(`Complete ${field.label || 'the required document fields'} before signing.`), { status: 400, statusCode: 400 });
    }
    if (value != null && String(value).trim() && ['radio', 'select'].includes(field.type) && !field.options?.some(o => String(o.value ?? o.label ?? o) === String(value))) {
      throw Object.assign(new Error(`Choose a valid option for ${field.label}.`), { status: 400, statusCode: 400 });
    }
  }
}

export function assertHireFormReady(template) {
  const key = String(template.lifecycle_item_key || '');
  const name = String(template.name || '');
  const needsInputs = ['w4', 'i9', 'direct_deposit_form'].includes(key) || /\bW-?4\b|\bI-?9\b|direct deposit|withholding certificate|health insurance opt/i.test(name);
  if (!needsInputs || template.document_action_type === 'review') return;
  // PDF candidates can use native fields or place their own entries without admin mapping.
  if (template.template_type === 'pdf' && template.file_path) return;
  let fields = template.field_definitions || [];
  try { if (typeof fields === 'string') fields = JSON.parse(fields); } catch { fields = []; }
  if (!Array.isArray(fields) || !fields.some(f => !['signature', 'date'].includes(f.type))) {
    throw Object.assign(new Error(`Configure the employee input fields for ${name} in Documents Library before assigning it.`), { status: 400 });
  }
}
