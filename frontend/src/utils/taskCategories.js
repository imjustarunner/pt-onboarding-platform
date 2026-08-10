export const TASK_CATEGORIES = [
  { value: 'qa_testing', label: 'QA / Testing' },
  { value: 'bug_fix', label: 'Bug fix' },
  { value: 'feature', label: 'Feature' },
  { value: 'ui_ux', label: 'UI / UX' },
  { value: 'payroll', label: 'Payroll & compensation' },
  { value: 'schools', label: 'Schools & portals' },
  { value: 'tasks_hub', label: 'Tasks & projects' },
  { value: 'assistant', label: 'Ask Assistant' },
  { value: 'analytics', label: 'Analytics & reporting' },
  { value: 'scheduling', label: 'Scheduling' },
  { value: 'billing', label: 'Billing' },
  { value: 'general', label: 'General' }
];

const LABEL_BY_VALUE = Object.fromEntries(TASK_CATEGORIES.map((c) => [c.value, c.label]));
const VALID = new Set(TASK_CATEGORIES.map((c) => c.value));

export function taskCategoryLabel(value) {
  return LABEL_BY_VALUE[value] || LABEL_BY_VALUE.general;
}

export function normalizeTaskCategory(value) {
  const v = String(value || 'general').trim().toLowerCase();
  return VALID.has(v) ? v : 'general';
}

export function normalizeTaskCategories(input) {
  let arr = [];
  if (Array.isArray(input)) arr = input;
  else if (input != null && input !== '') arr = [input];
  arr = [...new Set(arr.map(normalizeTaskCategory).filter((c) => c && c !== 'general'))];
  return arr.length ? arr : ['general'];
}

export function getTaskCategories(task) {
  if (!task) return ['general'];
  let raw = task.categories;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (Array.isArray(raw) && raw.length) return normalizeTaskCategories(raw);
  if (task.category) return normalizeTaskCategories([task.category]);
  return ['general'];
}

/** Categories to show in chips (hides lone "general"). */
export function displayTaskCategories(task) {
  const cats = getTaskCategories(task);
  const visible = cats.filter((c) => c !== 'general');
  return visible.length ? visible : [];
}

export function formatTaskCategoriesShort(task, max = 2) {
  const cats = displayTaskCategories(task);
  if (!cats.length) return '—';
  const labels = cats.map(taskCategoryLabel);
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} +${labels.length - max}`;
}

/** Infer category from auto-filed test task titles (for scripts / defaults). */
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
  if (lower.includes('project workspace') || lower.includes('bulk assign') || lower.includes('bulk category') || lower.includes('shared list') || lower.includes('inline quick-edit') || lower.includes('task table') || lower.includes('task category') || lower.includes('category column') || lower.includes('popover') || lower.includes('categories')) {
    return 'tasks_hub';
  }
  if (lower.includes('layout') || lower.includes('one-line') || lower.includes('ui/ux')) {
    return 'ui_ux';
  }
  if (t.startsWith('Test:')) return 'qa_testing';
  return 'general';
}
