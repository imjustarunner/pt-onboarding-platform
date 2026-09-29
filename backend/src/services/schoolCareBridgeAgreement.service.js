import crypto from 'node:crypto';

export const ITSCO_TRIAL_TERMS = Object.freeze({ trialStart: '2026-10-01', trialEnd: '2027-03-31', billingBasis: 'Per active school portal', billingFrequency: 'monthly', monthlyRateCents: null, cancellationNoticeDays: 30, currency: 'USD', paidServiceRequiresAgreement: true });
export const parseObject = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
export const scbError = (status, message) => Object.assign(new Error(message), { status, statusCode: status });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

export function normalizeAgreementTerms(input) {
  if (!date(input?.trialStart) || !date(input?.trialEnd) || input.trialEnd < input.trialStart) throw scbError(400, 'Enter a valid complimentary service period.');
  const rate = input.monthlyRateCents == null || input.monthlyRateCents === '' ? null : Number(input.monthlyRateCents);
  if (rate !== null && (!Number.isSafeInteger(rate) || rate < 0)) throw scbError(400, 'Monthly price must be an amount in whole cents.');
  const notice = Number(input.cancellationNoticeDays ?? 30);
  if (!Number.isInteger(notice) || notice < 0 || notice > 365) throw scbError(400, 'Cancellation notice must be between 0 and 365 days.');
  return { trialStart: input.trialStart, trialEnd: input.trialEnd, billingBasis: 'Per active school portal', billingFrequency: 'monthly', monthlyRateCents: rate, cancellationNoticeDays: notice, currency: 'USD', paidServiceRequiresAgreement: true };
}

export function renderSchoolCareBridgeAgreement({ agencyName, operatorName = 'MH4Kidz', terms, revision = 1 }) {
  const t = normalizeAgreementTerms(terms);
  const rate = t.monthlyRateCents == null ? 'Not set. A written pricing agreement is required before paid service begins.' : `$${(t.monthlyRateCents / 100).toFixed(2)} USD per active school portal per month, subject to a separate written activation of paid service.`;
  return `<article class="scb-agreement"><p>SchoolCareBridge · A program of ${escape(operatorName)}</p><h1>SchoolCareBridge Partner Agreement</h1><p>Revision ${Number(revision)} · ${escape(agencyName)} and ${escape(operatorName)}</p>
  <h2>1. Parties and purpose</h2><p>${escape(operatorName)} operates SchoolCareBridge. ${escape(agencyName)} (the Agency) joins the program to coordinate school-based services with its authorized schools and providers. Plot Twist Co supplies the platform to ${escape(operatorName)}; it is not the Agency’s clinical service provider under this agreement.</p>
  <h2>2. Included workspace</h2><p>The initial service includes branded school portals, school and provider coordination, authorized client rosters, schedules, staff access, messages, enrollment forms, referral packets and documents already enabled for the Agency. New SchoolCareBridge-only tenants receive a concise school-operations workspace and limited settings. An existing connected tenant retains its existing workspace and separately configured services.</p><p>Additional modules may be offered by a later written agreement. This agreement does not include payroll, hiring, financial transactions, marketplace services, sponsorships or a redesigned parent portal.</p>
  <h2>3. Complimentary service and commercial terms</h2><p>The SchoolCareBridge program fee is $0 from <strong>${escape(t.trialStart)} through ${escape(t.trialEnd)}</strong>, inclusive. This complimentary period applies only to SchoolCareBridge program fees. Existing agency charges for other services remain unchanged.</p><p>Standard billing basis: monthly, per active school portal. An active school portal means a school portal enabled for the Agency under its SchoolCareBridge participation. Proposed post-trial rate: ${escape(rate)}</p><p>There is no automatic paid conversion, payment-method authorization or invoice issuance under this complimentary agreement. Continued paid service requires the parties to agree to pricing and activate paid service in writing. Until then, paid service is not authorized. Any program fees are payable to ${escape(operatorName)}. Plot Twist Co invoices ${escape(operatorName)} separately for platform usage.</p>
  <h2>4. School and agency identity</h2><p>The Agency permits SchoolCareBridge to display its supplied name and logo in the partner directory, its agency entry, affiliated school portals, and relevant provider, form and message attribution. Schools retain their own names, logos, colors and configured imagery alongside SchoolCareBridge and “A program of MH4Kidz.” The Agency will provide accurate branding and request corrections when needed. Listing or logo display does not grant access to school or student records.</p>
  <h2>5. Accounts and authorized information</h2><p>The Agency identifies authorized staff, keeps school affiliations current, and promptly requests access changes when staff or relationships change. Users receive only the information allowed by existing memberships, roles and release-of-information controls. The Agency remains responsible for its clinical services, professional responsibilities, and required student or guardian permissions. This program agreement does not itself authorize release of student records or replace separately required data-sharing agreements.</p>
  <h2>6. Support and changes</h2><p>The parties use the configured program and agency support contacts for access, branding and service issues. Existing password, recovery and session controls apply. Future features and any changes to commercial scope require a written agreement. No availability guarantee or unverified regulatory certification is created by this document.</p>
  <h2>7. Ending participation</h2><p>Either party may end participation with ${t.cancellationNoticeDays} days’ written notice to the other party’s designated contact. The parties will coordinate access removal and handling of records under their existing applicable retention and data-sharing arrangements. Ending SchoolCareBridge participation does not automatically terminate a separate agency platform agreement.</p>
  <h2>8. Review, authority and signatures</h2><p>Each signer confirms authority to represent the named organization and agrees to this exact revision. Each party receives a separately signed counterpart of the same agreement text using the platform’s document-signing workflow. The agreement is fully executed only after both named representatives have signed. Each party can retain and print its signed document. Unsigned drafts create no executed agreement.</p>
  <p><strong>Agency:</strong> ${escape(agencyName)}<br/><strong>Program operator:</strong> ${escape(operatorName)}<br/>Electronic signatures and dates are recorded with the corresponding signed documents.</p></article>`;
}
export const agreementHash = html => crypto.createHash('sha256').update(html).digest('hex');

// Issue counterparts through the existing document task/signature workflow. No email
// or financial transaction is triggered here; the named signers act in their accounts.
export async function issueAgreement(db, { agreementId, expectedRevision, agencySignerId, operatorSignerId, actorUserId, expectedHash }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute(`SELECT g.*, a.name, a.official_name FROM schoolcarebridge_agreements g JOIN agencies a ON a.id=g.agency_id WHERE g.id=? FOR UPDATE`, [agreementId]);
    if (!row) throw scbError(404, 'Agreement not found.');
    if (row.status !== 'draft' || row.revision !== Number(expectedRevision)) throw scbError(409, 'This agreement changed or was already issued. Refresh before continuing.');
    const [[operator]] = await conn.execute(`SELECT a.id, a.name, a.official_name FROM schoolcarebridge_program_config p JOIN agencies a ON a.id=p.operator_agency_id WHERE p.id=1 AND a.slug='mh4kidz' AND a.is_active=TRUE AND COALESCE(a.is_archived,0)=0`);
    if (!operator) throw scbError(409, 'Link the active MH4Kidz operator before assigning signatures.');
    if (!Number.isSafeInteger(agencySignerId) || !Number.isSafeInteger(operatorSignerId) || agencySignerId === operatorSignerId) throw scbError(400, 'Choose a different authorized representative for each party.');
    for (const [userId, agencyId] of [[agencySignerId,row.agency_id],[operatorSignerId,operator.id]]) {
      const [[member]] = await conn.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=TRUE AND u.is_active=TRUE AND u.role IN ('admin','super_admin') LIMIT 1`, [userId,agencyId]);
      if (!member) throw scbError(400, 'Each signer must be an active administrator of the organization they represent.');
    }
    const html = renderSchoolCareBridgeAgreement({ agencyName: row.official_name || row.name, operatorName: operator.official_name || operator.name, terms: parseObject(row.terms_json), revision: row.revision });
    const hash = agreementHash(html);
    if (hash !== expectedHash) throw scbError(409, 'The agreement text changed. Refresh and review it before assigning signatures.');
    const taskIds = [];
    for (const [side,userId,agencyId] of [['agency',agencySignerId,row.agency_id],['operator',operatorSignerId,operator.id]]) {
      const title = `SchoolCareBridge Partner Agreement — ${row.name} (${side === 'agency' ? 'Agency' : 'MH4Kidz'})`;
      const [doc] = await conn.execute(`INSERT INTO user_specific_documents (user_id,name,description,template_type,html_content,document_action_type,field_definitions,created_by_user_id) VALUES (?,?,?,'html',?,'signature',?,?)`, [userId,title,`SchoolCareBridge agreement ${row.id}, revision ${row.revision}; SHA-256 ${hash}`,html,JSON.stringify([{type:'signature',label:'Authorized representative signature',required:true}]),actorUserId]);
      const [task] = await conn.execute(`INSERT INTO tasks (task_type,document_action_type,title,description,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,reference_id,metadata,status,is_required) VALUES ('document','signature',?,?,?,?,?,?,?,'pending',1)`, [title,'Review the agreement and sign only if authorized to represent your organization.',userId,agencyId,actorUserId,doc.insertId,JSON.stringify({schoolCareBridgeAgreementId:row.id,revision:row.revision,side,contentHash:hash})]);
      await conn.execute('UPDATE user_specific_documents SET task_id=? WHERE id=?',[task.insertId,doc.insertId]);
      taskIds.push(task.insertId);
    }
    await conn.execute(`UPDATE schoolcarebridge_agreements SET status='issued',rendered_html=?,content_hash=?,agency_signer_user_id=?,operator_signer_user_id=?,agency_task_id=?,operator_task_id=?,issued_by_user_id=?,issued_at=NOW() WHERE id=?`,[html,hash,agencySignerId,operatorSignerId,...taskIds,actorUserId,row.id]);
    await conn.commit();
    return { id: row.id, status: 'issued', agencyTaskId: taskIds[0], operatorTaskId: taskIds[1] };
  } catch(error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
