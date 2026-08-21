/** Stable hue 0–359 from any string (for tenant / provider color bands). */
export function hashHue(input) {
  const s = String(input || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  return h;
}

export function colorFromHue(hue, { sat = 62, light = 42 } = {}) {
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export function softBgFromHue(hue, { sat = 70, light = 94 } = {}) {
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export function tenantVisualKey(client) {
  return Number(client?.agency_id || 0) || String(client?.agency_name || client?.organization_name || 'tenant');
}

export function providerVisualKey(client) {
  const id = Number(client?.provider_id || 0);
  if (id > 0) return `p-${id}`;
  return `unassigned-${tenantVisualKey(client)}`;
}

export function rowAccentStyle(client, { platformMode = false } = {}) {
  const key = platformMode ? tenantVisualKey(client) : providerVisualKey(client);
  const hue = hashHue(key);
  return {
    '--cm-row-accent': colorFromHue(hue, { sat: 58, light: 48 }),
    '--cm-row-accent-soft': softBgFromHue(hue, { sat: 55, light: 96 }),
    borderLeftColor: colorFromHue(hue, { sat: 58, light: 48 })
  };
}

export function affiliationBadgeStyle(client, { platformMode = false } = {}) {
  const key = platformMode
    ? tenantVisualKey(client)
    : String(client?.organization_id || client?.organization_name || 'org');
  const hue = hashHue(key);
  return {
    color: colorFromHue(hue, { sat: 55, light: 32 }),
    background: softBgFromHue(hue, { sat: 62, light: 93 }),
    borderColor: `hsla(${hue}, 55%, 70%, 0.55)`
  };
}

/**
 * Display label for Affiliation column / badges.
 * ITSCO (and similar) office clients show "Office" instead of the agency org name.
 */
export function affiliationDisplayLabel(client) {
  const name = String(client?.organization_name || '').trim();
  const type = String(client?.organization_type || client?.agency_organization_type || '').toLowerCase();
  const orgId = Number(client?.organization_id || 0);
  const agencyId = Number(client?.agency_id || 0);
  const clientType = String(client?.client_type || '').toLowerCase();

  const looksOffice =
    type === 'office'
    || (orgId > 0 && agencyId > 0 && orgId === agencyId && ['agency', 'clinical', ''].includes(type))
    || clientType === 'clinical'
    || (/^itsco$/i.test(name) && type !== 'school')
    || (/\boffice\b/i.test(name) && !/\bschool\b/i.test(name));

  if (looksOffice) return 'Office';
  return name || '—';
}

/** Simplified Smart School ROI status for renewal / chart surfaces. */
export function schoolRoiSimpleStatus(roiExpiresAt) {
  if (roiExpiresAt == null || roiExpiresAt === '') return 'none';
  const ymd = String(roiExpiresAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'none';
  const todayYmd = new Date().toISOString().slice(0, 10);
  return ymd < todayYmd ? 'expired' : 'active';
}

export function initialsStyle(client, { platformMode = false } = {}) {
  const key = platformMode ? tenantVisualKey(client) : providerVisualKey(client);
  const hue = hashHue(key);
  return {
    color: colorFromHue(hue, { sat: 58, light: 34 }),
    background: softBgFromHue(hue, { sat: 60, light: 92 })
  };
}

/** Classify a client row for summary cards and status pill tone. */
export function clientStatusTone(client) {
  const workflow = String(client?.status || '').toUpperCase();
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  const paperworkKey = String(client?.paperwork_status_key || '').toLowerCase();
  const needed = Number(client?.paperwork_needed_count);

  if (paperworkKey === 'completed' || (Number.isFinite(needed) && needed <= 0)) {
    return 'completed';
  }
  if (
    ['pending', 'packet', 'prospective', 'waitlist', 'screener'].includes(statusKey) ||
    ['PACKET', 'SCREENER', 'PENDING_REVIEW', 'RETURNING'].includes(workflow)
  ) {
    return 'pending';
  }
  if (
    (Number.isFinite(needed) && needed > 1) ||
    workflow === 'ON_HOLD' ||
    paperworkKey === 'all_needed'
  ) {
    return 'attention';
  }
  if (statusKey === 'current' || workflow === 'ACTIVE') {
    return 'completed';
  }
  return 'neutral';
}

const STATUS_PILL_STYLES = {
  completed: { bg: '#ecfdf3', color: '#027a48', border: '#abefc6' },
  pending: { bg: '#fffaeb', color: '#b54708', border: '#fedf89' },
  attention: { bg: '#fef3f2', color: '#b42318', border: '#fecdca' },
  neutral: { bg: '#f2f4f7', color: '#344054', border: '#e4e7ec' }
};

export function statusPillStyle(client) {
  const tone = clientStatusTone(client);
  const s = STATUS_PILL_STYLES[tone] || STATUS_PILL_STYLES.neutral;
  return {
    color: s.color,
    background: s.bg,
    borderColor: s.border
  };
}

export function documentStatusTone(client) {
  const summary = String(client?.paperwork_status_label || '').toLowerCase();
  const needed = Number(client?.paperwork_needed_count);
  if (summary.includes('completed') || (Number.isFinite(needed) && needed <= 0)) return 'completed';
  if (Number.isFinite(needed) && needed > 1) return 'attention';
  if (summary.includes('needed') || summary.includes('packet') || summary.includes('new')) return 'pending';
  return 'neutral';
}

export function documentStatusStyle(client) {
  const tone = documentStatusTone(client);
  const map = {
    completed: { color: '#027a48' },
    pending: { color: '#b54708' },
    attention: { color: '#b42318' },
    neutral: { color: '#475467' }
  };
  return map[tone] || map.neutral;
}

export function summarizeClients(clients) {
  const rows = Array.isArray(clients) ? clients : [];
  let completed = 0;
  let pending = 0;
  let attention = 0;
  for (const c of rows) {
    const tone = clientStatusTone(c);
    if (tone === 'completed') completed += 1;
    else if (tone === 'pending') pending += 1;
    else if (tone === 'attention') attention += 1;
  }
  const total = rows.length;
  const pct = (n) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0.0');
  return {
    total,
    completed,
    pending,
    attention,
    completedPct: pct(completed),
    pendingPct: pct(pending),
    attentionPct: pct(attention)
  };
}
