const KIND_ORDER = ['disclosure', 'roi', 'demographics'];

export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizeSessionItems(items, { providerOnly = false } = {}) {
  const normalized = [];
  for (const item of items || []) {
    const clientId = Number(item?.clientId || item?.client_id || 0);
    const selected = KIND_ORDER.filter((kind) => item?.[kind] === true || (item?.kinds || []).includes(kind));
    if (!clientId || !selected.length) continue;
    if (providerOnly && selected.some((kind) => kind !== 'demographics')) {
      throw fail(403, 'A provider can send demographic confirmation only.');
    }
    normalized.push({ clientId, kinds: KIND_ORDER.filter((kind) => selected.includes(kind)) });
  }
  if (!normalized.length) throw fail(400, 'Choose at least one document.');
  const seen = new Set();
  for (const item of normalized) {
    if (seen.has(item.clientId)) throw fail(400, 'Each child can be included once.');
    seen.add(item.clientId);
  }
  return normalized;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function familyDocumentNotice({ childNames = [], link, signInUrl = '' }) {
  const who = childNames.length > 1 ? 'your children' : 'your child';
  const lead = `Documents for ${who} need acknowledgement, review, or a signature.`;
  const lines = [lead, link];
  if (signInUrl) lines.push(`If you already have an AuricWell password, sign in and open the same documents: ${signInUrl}`);
  else lines.push('If you have never signed in, this link is enough.');
  const html = [
    `<p>${escapeHtml(lead)}</p>`,
    `<p><a href="${escapeHtml(link)}">Open the documents</a></p>`,
    signInUrl
      ? `<p><a href="${escapeHtml(signInUrl)}">Sign in to AuricWell</a></p>`
      : '<p>If you have never signed in, this link is enough.</p>'
  ].join('');
  return {
    subject: 'Documents to review for your family',
    text: lines.join('\n\n'),
    html,
    sms: `${lead} ${link}`
  };
}

export function kindLabel(kind) {
  if (kind === 'disclosure') return 'School disclosure';
  if (kind === 'roi') return 'Smart ROI';
  return 'Demographic confirmation';
}
