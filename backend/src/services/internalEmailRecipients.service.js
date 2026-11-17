import pool from '../config/database.js';
import { CURRENT_MANAGED_DOMAINS } from './managedWorkspaceGroupPolicy.js';

const normalize = value => String(value || '').trim().toLowerCase();
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const fields = ['to', 'cc', 'bcc'];
const unavailable = () => Object.assign(new Error('Internal email addresses could not be checked. Please try again before sending.'), {
  status: 503, code: 'INTERNAL_RECIPIENT_CHECK_UNAVAILABLE'
});

function recipientAddresses(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(item => String(item?.email || item || '').split(/[,;\s]+/))
    .map(normalize).filter(Boolean);
}

// Adjacent transpositions count as one spelling error ("shcool" / "school").
function spellingDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  rows[0] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function suggestionsFor(address, known) {
  const local = address.split('@')[0];
  return [...known].map(email => ({ email, local: email.split('@')[0] }))
    .filter(candidate => Math.abs(candidate.local.length - local.length) <= 2)
    .map(candidate => ({ email: candidate.email, distance: spellingDistance(local, candidate.local) }))
    .filter(candidate => candidate.distance <= 2)
    .sort((a, b) => a.distance - b.distance || a.email.localeCompare(b.email))
    .slice(0, 3).map(candidate => candidate.email);
}

/** Read only the agency's registered mailboxes, never contacts or send history:
 * saving or attempting to send to a typo must not turn it into an approved address.
 * This is recognition of configured addresses, not proof of remote delivery.
 */
export async function checkInternalEmailRecipients({ agencyId, to, cc, bcc }) {
  const input = { to, cc, bcc };
  const recipients = fields.flatMap(field => [...new Set(recipientAddresses(input[field]))].map(address => ({ field, address })));
  if (recipients.length > 200 || recipients.some(r => r.address.length > 254)) {
    throw Object.assign(new Error('Use 200 or fewer complete recipient addresses.'), { status: 400 });
  }
  if (!recipients.length) return { domain: null, issues: [] };
  try {
    const [[agency]] = await pool.execute('SELECT id,slug,is_active,organization_type,feature_flags FROM agencies WHERE id=? LIMIT 1', [agencyId]);
    if (!agency) throw unavailable();
    const flags = typeof agency.feature_flags === 'string' ? JSON.parse(agency.feature_flags || '{}') : agency.feature_flags || {};
    const domain = normalize(flags.workspaceEmailDomain || flags.mailDomain || CURRENT_MANAGED_DOMAINS[agency.slug]).replace(/^@/, '');
    if (Number(agency.is_active) !== 1 || agency.organization_type !== 'agency' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return { domain: null, issues: [] };
    }
    const internal = recipients.filter(r => emailPattern.test(r.address) && r.address.split('@')[1] === domain);
    if (!internal.length) return { domain, issues: [] };
    const [rows] = await pool.execute(`SELECT from_email COLLATE utf8mb4_unicode_ci AS email FROM email_sender_identities WHERE agency_id=? AND is_active=1
      UNION SELECT r.email_address COLLATE utf8mb4_unicode_ci AS email FROM email_inbound_routes r
        JOIN email_sender_identities i ON i.id=r.sender_identity_id WHERE i.agency_id=? AND i.is_active=1 AND r.is_active=1
      UNION SELECT u.email COLLATE utf8mb4_unicode_ci AS email FROM users u JOIN user_agencies ua ON ua.user_id=u.id
        WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
          AND u.role NOT IN ('client','client_guardian','school_staff')
      UNION SELECT u.work_email COLLATE utf8mb4_unicode_ci AS email FROM users u JOIN user_agencies ua ON ua.user_id=u.id
        WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
          AND u.role NOT IN ('client','client_guardian','school_staff')
      UNION SELECT email COLLATE utf8mb4_unicode_ci AS email FROM managed_workspace_groups WHERE agency_id=? AND last_synced_at IS NOT NULL`,
    [agencyId, agencyId, agencyId, agencyId, agencyId]);
    const known = new Set(rows.map(r => normalize(r.email)).filter(email => emailPattern.test(email) && email.split('@')[1] === domain));
    return { domain, issues: internal.filter(r => !known.has(r.address)).map(r => ({ ...r, suggestions: suggestionsFor(r.address, known) })) };
  } catch (error) {
    if (error.code === 'INTERNAL_RECIPIENT_CHECK_UNAVAILABLE') throw error;
    // No fail-open send when the registry or tenant configuration is unavailable.
    throw unavailable();
  }
}

export async function assertInternalEmailRecipients(input) {
  const result = await checkInternalEmailRecipients(input);
  if (result.issues.length) {
    const issue = result.issues[0];
    const suggestion = issue.suggestions.length ? ` Did you mean ${issue.suggestions[0]}?` : '';
    throw Object.assign(new Error(`Unrecognized internal email address: ${issue.address}.${suggestion} Correct the address or ask Support to verify it before sending.`), {
      status: 400, code: 'UNRECOGNIZED_INTERNAL_RECIPIENT', recipientIssues: result.issues
    });
  }
  return result;
}
