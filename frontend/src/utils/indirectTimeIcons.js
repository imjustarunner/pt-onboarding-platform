/** Icon keys for hourly indirect service types (line-style SVGs). */

const PATHS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h1l5 4V6L5 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a4 4 0 0 1 0 7"/><path d="M18 6a7 7 0 0 1 0 12"/>',
  car: '<path d="M5 17h14v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2z"/><path d="M5 17l1.5-6.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 17"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20M8 20v-2h8v2"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M17 11l2 2 4-4"/>',
  handshake: '<path d="M11 17l-2 2a2.8 2.8 0 0 1-4 0l-1.5-1.5a2.8 2.8 0 0 1 0-4L8 9"/><path d="M13 7l2-2a2.8 2.8 0 0 1 4 0l1.5 1.5a2.8 2.8 0 0 1 0 4L16 15"/><path d="M8 12l4 4M12 8l4 4"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  circle: '<circle cx="12" cy="12" r="9"/>'
};

export const INDIRECT_TIME_ICON_OPTIONS = [
  { key: 'book', label: 'Book' },
  { key: 'file-text', label: 'Document' },
  { key: 'phone', label: 'Phone' },
  { key: 'megaphone', label: 'Megaphone' },
  { key: 'car', label: 'Car' },
  { key: 'laptop', label: 'Laptop' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'clipboard', label: 'Clipboard' },
  { key: 'users', label: 'People' },
  { key: 'user-check', label: 'User check' },
  { key: 'handshake', label: 'Handshake' },
  { key: 'more', label: 'Other' },
  { key: 'clock', label: 'Clock' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'circle', label: 'Circle' }
];

export function indirectTimeIconPaths(iconKey) {
  const key = String(iconKey || 'circle');
  return PATHS[key] || PATHS.circle;
}
