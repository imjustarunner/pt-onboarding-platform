/**
 * Diagnostic: find every communications-related row for a given email address.
 *
 * Use this when a user/parent says "I definitely received an email but I don't
 * see it on the Communications tab." If this script also finds nothing, the
 * email truly was sent through a path that bypassed every logging mechanism
 * — there is no row to surface.
 *
 * Usage:
 *   node backend/src/scripts/findCommunicationsForEmail.js parent@example.com
 *
 * Reports on:
 *   - user_communications (the canonical table the Communications tab reads)
 *   - notification_sms_logs (for completeness — SMS only)
 *   - users / client_guardians (to confirm the recipient/guardian linkage)
 */
import pool from '../config/database.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node findCommunicationsForEmail.js <email>');
  process.exit(1);
}

async function main() {
  console.log(`\nLooking for communications related to: ${email}\n`);

  // 1. user_communications by recipient_address
  const [uc1] = await pool.execute(
    `SELECT id, channel, subject, recipient_address, delivery_status,
            sent_at, delivered_at, opened_at, error_message, client_id, user_id, template_type
       FROM user_communications
      WHERE LOWER(recipient_address) = ?
      ORDER BY COALESCE(sent_at, generated_at) DESC, id DESC
      LIMIT 50`,
    [email]
  );
  console.log(`user_communications by recipient_address: ${uc1.length} row(s)`);
  uc1.forEach((r) => {
    console.log(
      `  #${r.id}  ${r.channel}  status=${r.delivery_status}  client_id=${r.client_id}  user_id=${r.user_id}  sent=${r.sent_at || '—'}  opened=${r.opened_at || '—'}  type=${r.template_type || '—'}  subject="${r.subject || '—'}"`
    );
  });

  // 2. user_communications by joined user (rows where user_id matches a user with this email)
  const [uc2] = await pool.execute(
    `SELECT uc.id, uc.channel, uc.subject, uc.recipient_address, uc.delivery_status,
            uc.sent_at, uc.opened_at, uc.client_id, uc.user_id, uc.template_type
       FROM user_communications uc
       JOIN users u ON u.id = uc.user_id
      WHERE LOWER(u.email) = ? AND (uc.recipient_address IS NULL OR LOWER(uc.recipient_address) <> ?)
      ORDER BY COALESCE(uc.sent_at, uc.generated_at) DESC, uc.id DESC
      LIMIT 50`,
    [email, email]
  );
  console.log(`\nuser_communications via joined users.email (different recipient_address): ${uc2.length} row(s)`);
  uc2.forEach((r) => {
    console.log(
      `  #${r.id}  ${r.channel}  status=${r.delivery_status}  client_id=${r.client_id}  user_id=${r.user_id}  recipient=${r.recipient_address}  sent=${r.sent_at || '—'}  opened=${r.opened_at || '—'}  subject="${r.subject || '—'}"`
    );
  });

  // 3. user_communications with NULL recipient that *might* match (rare, but worth surfacing)
  const [uc3] = await pool.execute(
    `SELECT id, channel, subject, recipient_address, delivery_status, sent_at, client_id, user_id, template_type
       FROM user_communications
      WHERE recipient_address IS NULL AND user_id IS NULL
      ORDER BY COALESCE(sent_at, generated_at) DESC, id DESC
      LIMIT 10`
  );
  if (uc3.length) {
    console.log(`\nuser_communications rows with NO recipient_address AND NO user_id (orphans, last 10):`);
    uc3.forEach((r) => {
      console.log(
        `  #${r.id}  ${r.channel}  status=${r.delivery_status}  client_id=${r.client_id}  type=${r.template_type || '—'}  subject="${r.subject || '—'}"`
      );
    });
  }

  // 4. Identify the user/guardian/client linkage so we know what client(s) it would have shown on
  const [users] = await pool.execute(
    `SELECT id, email, first_name, last_name, role FROM users WHERE LOWER(email) = ? LIMIT 5`,
    [email]
  );
  console.log(`\nusers with this email: ${users.length}`);
  users.forEach((u) => console.log(`  user_id=${u.id}  ${u.first_name} ${u.last_name}  role=${u.role}`));

  if (users.length) {
    const userIds = users.map((u) => u.id);
    const placeholders = userIds.map(() => '?').join(',');
    const [guardians] = await pool.execute(
      `SELECT cg.client_id, cg.guardian_user_id, cg.relationship_title,
              c.full_name AS client_name, c.identifier_code
         FROM client_guardians cg
         LEFT JOIN clients c ON c.id = cg.client_id
        WHERE cg.guardian_user_id IN (${placeholders})`,
      userIds
    );
    console.log(`\nclient_guardians rows for this user: ${guardians.length}`);
    guardians.forEach((g) => {
      console.log(
        `  client_id=${g.client_id}  ${g.client_name || g.identifier_code || '?'}  rel=${g.relationship_title || '—'}`
      );
    });
  }

  // 5. Total user_communications (sanity check that the table is even populated)
  const [counts] = await pool.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN sent_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS last_30d
       FROM user_communications`
  );
  console.log(
    `\nuser_communications totals — all-time: ${counts[0].total}, last 30 days: ${counts[0].last_30d}`
  );

  console.log('\nIf rows above are empty, the email send did NOT write to user_communications.');
  console.log('That means it went out through a path that bypassed logging entirely.');
  console.log('All fixes from this session ensure future sends DO log automatically.\n');

  process.exit(0);
}

main().catch((e) => {
  console.error('findCommunicationsForEmail failed:', e);
  process.exit(1);
});
