export const claimStatusLabel = status => ({ draft: 'Draft', ready: 'Ready for review', queued: 'Submission unresolved', submitted: 'Submitted / acknowledged', rejected: 'Rejected', denied: 'Denied', paid: 'Marked paid', adjusted: 'Adjusted', void: 'Void' })[status] || status || 'Unknown';
export const claimStatusTone = status => ['rejected', 'denied'].includes(status) ? 'danger' : ['queued', 'draft'].includes(status) ? 'warning' : status === 'paid' ? 'success' : 'info';
export function billingTotals(organizations) {
  if (organizations.some(o => o.counts === null)) return null;
  const sum = statuses => organizations.reduce((n, o) => n + statuses.reduce((s, status) => s + Number(o.counts?.[status] || 0), 0), 0);
  return { active: sum(['draft', 'ready', 'queued', 'submitted', 'rejected', 'denied']), ready: sum(['ready']), drafts: sum(['draft']), progress: sum(['queued', 'submitted']), attention: sum(['rejected', 'denied','service_changes']), paid: sum(['paid']) };
}
export function billingBrand(organization) {
  let colors = organization?.colors;
  if (typeof colors === 'string') { try { colors = JSON.parse(colors); } catch { colors = {}; } }
  const primary = colors?.primary;
  if (!/^#[\da-f]{6}$/i.test(primary || '')) return {};
  const rgb = primary.slice(1).match(/../g).map(v => parseInt(v, 16));
  const light = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 160;
  return { '--bw-brand': primary, '--bw-on-brand': light ? '#132238' : '#ffffff' };
}
