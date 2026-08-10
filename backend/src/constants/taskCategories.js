export const TASK_CATEGORY_VALUES = new Set([
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
