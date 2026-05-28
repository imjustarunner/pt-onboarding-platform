/**
 * Resolve public registration URLs for event-station / event-day kiosks.
 * Prefers active intake_links locked to the company event; falls back to
 * company_events.registration_form_url when no digital form is linked.
 */

function publicAppBaseUrl() {
  return String(
    process.env.PUBLIC_INTAKE_BASE_URL
      || process.env.PUBLIC_APP_URL
      || process.env.FRONTEND_URL
      || ''
  ).trim().replace(/\/+$/, '');
}

export function buildPublicFormUrl(publicKey, formType) {
  const key = String(publicKey || '').trim();
  if (!key) return null;
  const base = publicAppBaseUrl();
  const path = String(formType || '').trim() === 'internal_preferences'
    ? `/preferences-form/${encodeURIComponent(key)}`
    : `/intake/${encodeURIComponent(key)}`;
  return base ? `${base}${path}` : path;
}

function normalizeExternalUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url.slice(0, 2048);
  return null;
}

function mapIntakeLinkRow(row) {
  const publicKey = String(row?.public_key || '').trim();
  const formType = String(row?.form_type || 'intake').trim() || 'intake';
  const url = buildPublicFormUrl(publicKey, formType);
  if (!url) return null;
  return {
    id: Number(row.id),
    title: String(row.title || '').trim() || 'Registration',
    publicKey,
    formType,
    url,
    source: 'intake_link'
  };
}

/**
 * @param {import('mysql2/promise').Pool} poolConn
 * @param {number} eventId
 * @param {{ registrationFormUrl?: string|null }} [options]
 */
export async function loadCompanyEventRegistrationForKiosk(poolConn, eventId, options = {}) {
  const eid = Number(eventId);
  if (!eid) {
    return { available: false, primary: null, links: [], externalUrl: null };
  }

  let linkRows = [];
  try {
    const [rows] = await poolConn.execute(
      `SELECT id, title, public_key, form_type, is_active
       FROM intake_links
       WHERE company_event_id = ? AND is_active = 1
       ORDER BY
         CASE WHEN LOWER(COALESCE(form_type, '')) = 'smart_registration' THEN 0 ELSE 1 END,
         updated_at DESC, id DESC`,
      [eid]
    );
    linkRows = rows || [];
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  const links = linkRows.map(mapIntakeLinkRow).filter(Boolean);
  const externalUrl = normalizeExternalUrl(options.registrationFormUrl);

  let primary = links[0] || null;
  if (!primary && externalUrl) {
    primary = {
      id: null,
      title: 'Registration',
      publicKey: null,
      formType: 'external',
      url: externalUrl,
      source: 'external_url'
    };
  }

  return {
    available: !!(links.length || externalUrl),
    primary,
    links,
    externalUrl
  };
}
