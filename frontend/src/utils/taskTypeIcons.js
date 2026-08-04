/** Lightweight SVG icon map for task work types (no extra dependency). */
const ICONS = {
  circle: '<circle cx="12" cy="12" r="8"/>',
  star: '<polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.1a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'graduation-cap': '<path d="M22 10L12 4 2 10l10 6 10-6z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/>',
  'file-signature': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17c1.5-2 3-3 4-3s2 .5 3 2"/>',
  'list-checks': '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  'alert-triangle': '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  mail: '<path d="M4 4h16v16H4z"/><path d="M22 6l-10 7L2 6"/>',
  clipboard: '<path d="M9 2h6v4H9z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.1z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'
};

export function taskTypeIconSvg(iconKey, color = 'currentColor') {
  const path = ICONS[iconKey] || ICONS.circle;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export const TASK_TYPE_FALLBACKS = {
  documentation: { color: '#7c3aed', icon: 'file-text', label: 'Documentation' },
  administrative: { color: '#16a34a', icon: 'briefcase', label: 'Administrative' },
  client_care: { color: '#2563eb', icon: 'heart', label: 'Client Care' },
  outreach: { color: '#ca8a04', icon: 'phone', label: 'Outreach' },
  personal: { color: '#9333ea', icon: 'user', label: 'Personal' },
  training: { color: '#ea580c', icon: 'graduation-cap', label: 'Training' },
  document: { color: '#0f766e', icon: 'file-signature', label: 'Document' },
  meeting_action: { color: '#db2777', icon: 'list-checks', label: 'Meeting Action' },
  escalation: { color: '#dc2626', icon: 'alert-triangle', label: 'Escalation' },
  custom: { color: '#64748b', icon: 'circle', label: 'General' }
};

export function resolveTaskTypeMeta(task, typeDefs = []) {
  if (task?.work_type_id && typeDefs.length) {
    const hit = typeDefs.find((t) => Number(t.id) === Number(task.work_type_id));
    if (hit) {
      return {
        label: hit.label,
        color: hit.color_hex || '#64748b',
        icon: task.work_type_icon_key || hit.icon_key || 'circle'
      };
    }
  }
  const slug = String(task?.task_type || 'custom');
  const bySystem = typeDefs.find((t) => t.system_task_type === slug);
  if (bySystem) {
    return {
      label: bySystem.label,
      color: bySystem.color_hex || '#64748b',
      icon: task.work_type_icon_key || bySystem.icon_key || 'circle'
    };
  }
  const fb = TASK_TYPE_FALLBACKS[slug] || TASK_TYPE_FALLBACKS.custom;
  return { label: fb.label, color: fb.color, icon: task.work_type_icon_key || fb.icon };
}
