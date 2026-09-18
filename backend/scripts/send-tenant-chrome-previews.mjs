/**
 * Send tenant HTML chrome + forms signature previews to testing@itsco.health.
 * Mental Range is an entity, not a tenant — no forms email.
 *
 * Usage: node backend/scripts/send-tenant-chrome-previews.mjs
 */
import { sendEmailFromIdentity } from '../src/services/unifiedEmail/unifiedEmailSender.service.js';
import pool from '../src/config/database.js';

const TO = 'testing@itsco.health';
const TENANTS = [
  { agencyId: 2, name: 'ITSCO' },
  { agencyId: 1, name: 'PlotTwistCo' },
  { agencyId: 6, name: 'Next Level Up' },
  { agencyId: 377, name: 'The Inner Strength Institute' },
  { agencyId: 434, name: 'MH4kidz' }
];

try {
  for (const tenant of TENANTS) {
    const [rows] = await pool.execute(
      `SELECT id, display_name, from_email
       FROM email_sender_identities
       WHERE agency_id = ? AND identity_key = 'forms' AND is_active = 1
       LIMIT 1`,
      [tenant.agencyId]
    );
    const identity = rows?.[0];
    if (!identity) {
      console.error(`no forms identity for ${tenant.name}`);
      continue;
    }
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111;">
      <p style="margin:0 0 10px;">Hi there,</p>
      <p style="margin:0 0 10px;">This is the <strong>${tenant.name}</strong> forms email: that organization's header, footer, colors, quote, and support link — not ITSCO defaults. Replies should go to support@.</p>
    </div>`;
    const result = await sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to: TO,
      subject: `${tenant.name} forms email chrome (no ITSCO defaults)`,
      text: `Hi there,\n\nThis is the ${tenant.name} forms email: that organization's header, footer, colors, quote, and support link — not ITSCO defaults.`,
      html,
      source: 'manual'
    });
    console.log(tenant.name, identity.from_email, result?.id || result?.gmailId || result);
  }

  const [schoolRows] = await pool.execute(
    `SELECT i.id, i.from_email, a.name
     FROM email_sender_identities i
     JOIN agencies a ON a.id = i.agency_id
     WHERE i.is_active = 1
       AND LOWER(COALESCE(a.organization_type, '')) = 'school'
       AND i.from_email LIKE '%@%'
     ORDER BY i.id DESC
     LIMIT 1`
  );
  const school = schoolRows?.[0];
  if (school) {
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111;">
      <p style="margin:0 0 10px;">Hi there,</p>
      <p style="margin:0 0 10px;">This is a school-sent email from <strong>${school.name}</strong>. Contact Support should still appear in the footer.</p>
    </div>`;
    const result = await sendEmailFromIdentity({
      senderIdentityId: school.id,
      to: TO,
      subject: `School email chrome — ${school.name}`,
      text: `Hi there,\n\nThis is a school-sent email from ${school.name}. Contact Support should still appear in the footer.`,
      html,
      source: 'manual'
    });
    console.log('school', school.from_email, result?.id || result?.gmailId || result);
  }
} finally {
  await pool.end();
  process.exit(0);
}
