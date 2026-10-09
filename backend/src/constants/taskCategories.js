export const TASK_CATEGORY_VALUES = new Set([
  'client',
  'qa_testing',
  'bug_fix',
  'feature',
  'ui_ux',
  'payroll',
  'schools',
  'tasks_hub',
  'assistant',
  'analytics',
  'scheduling',
  'billing',
  'general'
]);

export function normalizeTaskCategory(value) {
  const v = String(value || 'general').trim().toLowerCase();
  return TASK_CATEGORY_VALUES.has(v) ? v : 'general';
}

export function normalizeTaskCategories(input) {
  let arr = [];
  if (Array.isArray(input)) arr = input;
  else if (input != null && input !== '') arr = [input];
  arr = [...new Set(arr.map(normalizeTaskCategory).filter((c) => c && c !== 'general'))];
  return arr.length ? arr : ['general'];
}

export function parseTaskCategoriesFromRow(row) {
  if (!row) return ['general'];
  let raw = row.categories;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (Array.isArray(raw) && raw.length) return normalizeTaskCategories(raw);
  if (row.category) return normalizeTaskCategories([row.category]);
  return ['general'];
}

/** Infer category from auto-filed test task titles (for create defaults / backfill). */
export function inferTaskCategoryFromTitle(title) {
  const t = String(title || '');
  const lower = t.toLowerCase();
  if (lower.includes('payroll') || lower.includes('additional pay') || lower.includes('supervision pay') || lower.includes('direct/indirect')) {
    return 'payroll';
  }
  if (lower.includes('school') || lower.includes('year update') || lower.includes('coverage') || lower.includes('reinit')) {
    return 'schools';
  }
  if (lower.includes('ask assistant') || lower.includes('assistant routing')) {
    return 'assistant';
  }
  if (lower.includes('usage analytics') || lower.includes('nav shortcut') || lower.includes('quick nav')) {
    return 'analytics';
  }
  if (
    lower.includes('project workspace')
    || lower.includes('bulk assign')
    || lower.includes('bulk category')
    || lower.includes('shared list')
    || lower.includes('inline quick-edit')
    || lower.includes('task table')
    || lower.includes('task category')
    || lower.includes('category column')
    || lower.includes('popover')
    || lower.includes('categories')
  ) {
    return 'tasks_hub';
  }
  if (lower.includes('layout') || lower.includes('one-line') || lower.includes('ui/ux') || lower.includes(' ui ')) {
    return 'ui_ux';
  }
  if (t.startsWith('Test:')) return 'qa_testing';
  return 'general';
}

export function resolveTaskCategories(categories, title) {
  if (categories !== undefined && categories !== null) {
    const normalized = normalizeTaskCategories(categories);
    if (normalized.length === 1 && normalized[0] === 'general') {
      const inferred = inferTaskCategoryFromTitle(title);
      if (inferred !== 'general') return normalizeTaskCategories(inferred);
    }
    return normalized;
  }
  return normalizeTaskCategories(inferTaskCategoryFromTitle(title));
}

// Client-linked and explicitly Client-tagged tasks must not be disclosed by SMS.
// This also protects legacy tasks created before the Client category existed.
export function isClientRelatedTask(task = {}) {
  const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
  const meta = parse(task.metadata) || {};
  const parsedCategories = parse(task.categories);
  const tags = [task.category, ...(Array.isArray(parsedCategories) ? parsedCategories : []), ...(Array.isArray(meta.tags) ? meta.tags : [meta.tags])];
  if (tags.some(t => /^clients?$/i.test(String(t || '').trim()))) return true;
  if (task.linked_schedule_event_id || task.description_ciphertext || task.encryptDescription) return true;
  if (/client|clinical|intake|documentation|office_event|appointment/i.test(String(task.task_type || '')+' '+String(task.source_ref_type || '')+' '+String(meta.source || ''))) return true;
  const hasClient = object => object && typeof object === 'object' && Object.entries(object).some(([key,value]) =>
    value != null && value !== '' && value !== false && value !== 0 && (/client|patient/i.test(key) || hasClient(value)));
  return Boolean(hasClient(meta));
}
