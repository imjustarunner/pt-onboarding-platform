/** Shared helpers for My Documents and admin User Documents views */

import {
  DEFAULT_DOCUMENT_CATEGORY_ORDER,
  getDisplayCategoryMeta,
  resolveCategoryIdForTask,
  sanitizeCategoryOrder,
} from '../config/documentDisplayCategories';

const CATEGORY_MAP = {
  acknowledgment: 'Compliance & Agreements',
  authorization: 'Compliance & Agreements',
  agreement: 'Compliance & Agreements',
  hipaa_security: 'Compliance & Agreements',
  compliance: 'Compliance & Agreements',
  consent: 'Onboarding & Consent',
  audio_recording_consent: 'Onboarding & Consent',
  disclosure: 'Onboarding & Consent',
  school: 'School & Education',
  school_roi: 'School & Education',
  administrative: 'Administrative',
};

const CATEGORY_ORDER = [
  'Onboarding & Consent',
  'Compliance & Agreements',
  'School & Education',
  'Signature Required',
  'Review Required',
  'Administrative',
  'Other Documents',
];

/** Mockup-aligned section labels, icons, and tags */
export const CATEGORY_HUB_META = {
  'Onboarding & Consent': { title: 'Onboarding', tag: 'All Providers', icon: 'folder' },
  'Compliance & Agreements': { title: 'Credentialing', tag: 'Compliance', icon: 'shield' },
  'School & Education': { title: 'Professional', tag: 'Education', icon: 'briefcase' },
  'Signature Required': { title: 'Signatures', tag: 'Required', icon: 'pen' },
  'Review Required': { title: 'Reviews', tag: 'Required', icon: 'eye' },
  Administrative: { title: 'Administrative', tag: 'Internal', icon: 'file' },
  'Other Documents': { title: 'Personal', tag: 'Other', icon: 'user' },
};

export function getCategoryHubMeta(categoryName) {
  return (
    CATEGORY_HUB_META[categoryName] || {
      title: categoryName,
      tag: 'Documents',
      icon: 'file',
    }
  );
}

export function formatDocumentDate(dateString, { includeTime = false } = {}) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  if (includeTime) return d.toLocaleString();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isTaskOverdue(task) {
  if (!task?.due_date || task.status === 'completed') return false;
  return new Date(task.due_date) < new Date();
}

export function getTaskEffectiveStatus(task) {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'overridden') return 'overridden';
  if (isTaskOverdue(task)) return 'overdue';
  return task.status || 'pending';
}

export function getDocumentStatusLabel(task) {
  const status = getTaskEffectiveStatus(task);
  if (status === 'completed') {
    return task.document_action_type === 'review' ? 'Reviewed' : 'Signed';
  }
  if (status === 'overridden') return 'Overridden';
  if (status === 'overdue') {
    return task.document_action_type === 'review' ? 'Pending Review' : 'Pending Signature';
  }
  if (status === 'in_progress') return 'In Progress';
  if (!task.due_date && status !== 'completed') return 'Missing';
  if (task.document_action_type === 'review') return 'Pending Review';
  return 'Pending Signature';
}

export function getDocumentStatusBadgeClass(task) {
  const label = getDocumentStatusLabel(task);
  if (label === 'Signed' || label === 'Reviewed') return 'doc-pill--success';
  if (label === 'Missing') return 'doc-pill--danger';
  if (label === 'Pending Signature' || label === 'Pending Review' || label === 'In Progress') {
    return 'doc-pill--warning';
  }
  return 'doc-pill--muted';
}

export function getDocumentActionTypeLabel(task) {
  return task.document_action_type === 'signature' ? 'Signature Required' : 'Review Required';
}

export function getDocumentSourceLabel(task) {
  if (task.task_list_name) return task.task_list_name;
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  if (meta.moduleName) return meta.moduleName;
  if (meta.trainingFocusName) return meta.trainingFocusName;
  if (meta.source) return String(meta.source).replace(/_/g, ' ');
  if (task.is_user_specific || meta.userSpecific) return 'Uploaded for user';
  return 'Document library';
}

/** Resolve employee hub category id for a document task */
export function getDocumentCategoryId(task) {
  return resolveCategoryIdForTask(task);
}

export function computeSectionProgress(items) {
  const total = items?.length || 0;
  if (!total) return { completed: 0, total: 0, pct: 0 };
  const completed = items.filter((t) => getTaskEffectiveStatus(t) === 'completed').length;
  return { completed, total, pct: Math.round((completed / total) * 100) };
}

/** Incomplete tasks that need attention soon (for action-required banner). */
export function getActionRequiredTasks(tasks, { limit = 8 } = {}) {
  const now = new Date();
  const week = new Date(now);
  week.setDate(week.getDate() + 7);

  const scored = (tasks || [])
    .filter((t) => getTaskEffectiveStatus(t) !== 'completed')
    .map((t) => {
      const eff = getTaskEffectiveStatus(t);
      let score = 10;
      if (eff === 'overdue') score = 100;
      else if (t.due_date) {
        const due = new Date(t.due_date);
        if (!Number.isNaN(due.getTime())) {
          if (due <= week) score = 80;
          else score = 40;
        }
      }
      if (t.document_action_type === 'signature') score += 5;
      return { task: t, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.task);
}

/** @deprecated Use getDocumentCategoryId — legacy label for admin grouping */
export function getDocumentCategory(task) {
  return getDisplayCategoryMeta(getDocumentCategoryId(task)).title;
}

export function groupTasksByDisplayCategory(tasks, categoryOrder = DEFAULT_DOCUMENT_CATEGORY_ORDER) {
  const order = sanitizeCategoryOrder(categoryOrder);
  const buckets = new Map(order.map((id) => [id, []]));

  for (const task of tasks) {
    const id = getDocumentCategoryId(task);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(task);
  }

  return order
    .filter((id) => (buckets.get(id) || []).length > 0)
    .map((id) => {
      const items = buckets.get(id) || [];
      return {
        id,
        name: id,
        meta: getDisplayCategoryMeta(id),
        items,
        progress: computeSectionProgress(items),
      };
    });
}

/** All categories in user order (includes empty sections — for reorder UI) */
export function groupAllDisplayCategories(categoryOrder = DEFAULT_DOCUMENT_CATEGORY_ORDER) {
  const order = sanitizeCategoryOrder(categoryOrder);
  return order.map((id) => ({
    id,
    name: id,
    meta: getDisplayCategoryMeta(id),
    items: [],
  }));
}

export function groupTasksByCategory(tasks) {
  return groupTasksByDisplayCategory(tasks, DEFAULT_DOCUMENT_CATEGORY_ORDER);
}

export { sanitizeCategoryOrder, DEFAULT_DOCUMENT_CATEGORY_ORDER };

export function computeDocumentStats(tasks) {
  const total = tasks.length;
  let completed = 0;
  let pending = 0;
  let overdue = 0;
  for (const t of tasks) {
    const eff = getTaskEffectiveStatus(t);
    if (eff === 'completed') completed++;
    else if (eff === 'overdue') overdue++;
    else pending++;
  }
  const required = total;
  const completionPct = required ? Math.round((completed / required) * 100) : 0;
  return { total, completed, pending, overdue, required, completionPct };
}

/** Stats row matching the User Documents mockup */
export function computeHubStats(tasks) {
  const base = computeDocumentStats(tasks);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const recentlyAdded = tasks.filter((t) => {
    const created = new Date(t.created_at || 0);
    return !Number.isNaN(created.getTime()) && created >= cutoff;
  }).length;
  const pendingSignatures = tasks.filter(
    (t) => t.document_action_type === 'signature' && t.status !== 'completed'
  ).length;
  const missing = tasks.filter((t) => getTaskEffectiveStatus(t) !== 'completed').length;
  return {
    ...base,
    recentlyAdded,
    pendingSignatures,
    missing,
  };
}

export function getUniqueSourceOptions(tasks) {
  const set = new Set();
  for (const t of tasks) {
    set.add(getDocumentSourceLabel(t));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function groupTasksBySourceProgress(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const name = getDocumentSourceLabel(t);
    if (!map.has(name)) map.set(name, { name, total: 0, done: 0 });
    const row = map.get(name);
    row.total += 1;
    if (t.status === 'completed') row.done += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 6);
}

export function getRecentlyUploaded(tasks, limit = 5) {
  return [...tasks]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

export function daysUntil(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

export function formatDocumentTypeFilter(type) {
  const types = {
    acknowledgment: 'Acknowledgment',
    authorization: 'Authorization',
    agreement: 'Agreement',
    audio_recording_consent: 'Audio Recording Consent',
    hipaa_security: 'HIPAA Security',
    compliance: 'Compliance',
    disclosure: 'Disclosure',
    consent: 'Consent',
    school: 'School',
    school_roi: 'School ROI',
    administrative: 'Administrative',
  };
  return types[type] || type;
}

export function sortDocumentTasks(tasks, sortKey) {
  const docs = [...tasks];
  switch (sortKey) {
    case 'unfinished':
      return docs.sort((a, b) => {
        const aOver = isTaskOverdue(a);
        const bOver = isTaskOverdue(b);
        if (aOver && !bOver) return -1;
        if (!aOver && bOver) return 1;
        const aInc = a.status !== 'completed';
        const bInc = b.status !== 'completed';
        if (aInc && !bInc) return -1;
        if (!aInc && bInc) return 1;
        if (aInc && bInc && a.due_date && b.due_date) {
          return new Date(a.due_date) - new Date(b.due_date);
        }
        return 0;
      });
    case 'alphabetical':
      return docs.sort((a, b) =>
        (a.title || 'Document').localeCompare(b.title || 'Document', undefined, { sensitivity: 'base' })
      );
    case 'due-date':
      return docs.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });
    case 'status': {
      const order = { overdue: -1, pending: 0, in_progress: 1, completed: 2, overridden: 3 };
      return docs.sort(
        (a, b) => (order[getTaskEffectiveStatus(a)] ?? 4) - (order[getTaskEffectiveStatus(b)] ?? 4)
      );
    }
    case 'recent':
      return docs.sort(
        (a, b) =>
          new Date(b.completed_at || b.updated_at || b.created_at) -
          new Date(a.completed_at || a.updated_at || a.created_at)
      );
    default:
      return docs;
  }
}

export function filterDocumentTasks(tasks, { search = '', status = 'all', type = 'all', source = 'all' } = {}) {
  let result = [...tasks];
  const q = search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }
  if (status !== 'all') {
    result = result.filter((t) => {
      const eff = getTaskEffectiveStatus(t);
      if (status === 'completed') return eff === 'completed';
      if (status === 'pending') return eff === 'pending' || eff === 'in_progress';
      if (status === 'overdue') return eff === 'overdue';
      return true;
    });
  }
  if (type !== 'all') {
    result = result.filter((t) => t.document_action_type === type);
  }
  if (source !== 'all') {
    result = result.filter((t) => getDocumentSourceLabel(t) === source);
  }
  return result;
}
