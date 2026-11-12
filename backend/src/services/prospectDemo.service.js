import crypto from 'node:crypto';

export const PROSPECT_SEED_VERSION = '2026-11-11.1';
export const DEMO_NOTICE = 'Demonstration only. Provider names and practice details are based on public information. Clients, appointments, availability and job listings are examples, not real care or open positions.';
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const marks = rows => rows.map(() => '?').join(',');
const nameOf = row => [row.first_name, row.last_name].filter(Boolean).join(' ');
export const isTemporaryDemoEmail = value => /^[a-z0-9.+_-]+@(?:[a-z0-9-]+\.)?demo\.invalid$/i.test(String(value || ''));
function slug(value, max = 80) {
  const result = String(value || '').trim().toLowerCase();
  if (!new RegExp(`^[a-z0-9][a-z0-9-]{0,${max - 1}}$`).test(result)) throw fail(400, 'Use a valid organization slug.');
  return result;
}
function email(value) {
  const result = String(value || '').trim().toLowerCase();
  if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw fail(400, 'Enter a valid email address.');
  return result;
}
const val = value => value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
export function prospectPlan(research, input = {}) {
  if (!research || !Array.isArray(research.providers) || !research.providers.length || research.providers.length > 250) throw fail(400, 'Research must include 1–250 providers.');
  const organization = research.organization || {};
  const organizationSlug = slug(input.slug);
  const providers = research.providers.map((p, index) => {
    const name = String(p.name || '').trim();
    if (!name || name.length > 180) throw fail(400, 'Review each provider name.');
    const words = name.split(/\s+/), lastName = words.length > 1 ? words.pop() : '';
    return { ...p, firstName: words.join(' '), lastName,
      email: `provider.${index + 1}@${organizationSlug}.demo.invalid`,
      credential: (p.website_listed_credentials || []).filter(x => /^(LPC|LPCC|MFTC|LMFT|LCSW|LSW|PsyD|PhD|DEd|Intern)$/i.test(x)).join(', ') || (/intern/i.test(p.title_role || '') ? 'Intern' : null) };
  });
  const ownerIndex = Number.isInteger(input.ownerIndex) ? input.ownerIndex : providers.findIndex(p => /owner/i.test(p.title_role || ''));
  if (ownerIndex < 0 || ownerIndex >= providers.length) throw fail(400, 'Identify the owner provider.');
  if (input.ownerEmail) providers[ownerIndex].email = email(input.ownerEmail);
  return { slug: organizationSlug, providerAlias: slug(input.providerAlias || `${organizationSlug}providers`, 100),
    careersAlias: slug(input.careersAlias || `${organizationSlug}careers`, 100),
    name: String(val(organization.brand_name) || input.name || '').trim(),
    officialName: String(val(organization.legal_name) || val(organization.brand_name) || '').trim(),
    ownerIndex, providers, research, logoUrl: input.logoUrl || `/assets/prospects/${organizationSlug}/logo.svg`,
    sourceAgencyId: Number(input.sourceAgencyId || 450), actorUserId: Number(input.actorUserId),
    fixtureCount: Math.max(providers.length, Math.min(200, Number(input.fixtureCount) || providers.length * 2)),
    selfPayRateCents: Number.isSafeInteger(input.selfPayRateCents) ? input.selfPayRateCents : null };
}

const OWNED_TABLES = Object.freeze({ client: 'clients', assignment: 'client_provider_assignments',
  appointment: 'appointments', participant: 'appointment_participants', availability: 'provider_virtual_working_hours',
  job: 'hiring_job_descriptions', draft: 'clinical_note_drafts', candidate: 'users', provider: 'users', profile: 'provider_public_profiles', office: 'office_locations' });
const DELETE_ORDER = ['participant','appointment','draft','assignment','client','availability','job','candidate'];

export function createProspectDemoService({ database, hashPassword }) {
  if (!database || !hashPassword) throw new Error('Database and password hashing are required.');
  async function tx(fn, connection = null) {
    if (connection) return fn(connection);
    const db = await database.getConnection();
    try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  }
  async function insert(db, table, row) {
    const columns = Object.keys(row);
    const [result] = await db.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${marks(columns)})`, Object.values(row));
    return Number(result.insertId);
  }
  async function audit(db, actorId, agencyId, action, metadata) {
    await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES(?,?,?,?)',
      [action, actorId, agencyId, JSON.stringify(metadata)]);
  }
  async function instance(db, agencyId, lock = false) {
    const [[row]] = await db.execute(`SELECT d.*,a.name,a.feature_flags,a.logo_url,a.color_palette FROM prospect_demo_instances d
      JOIN agencies a ON a.id=d.agency_id WHERE d.agency_id=?${lock ? ' FOR UPDATE' : ''}`, [Number(agencyId)]);
    if (!row) throw fail(404, 'Prospect workspace not found.');
    row.research_json = json(row.research_json); row.feature_flags = json(row.feature_flags);
    return row;
  }
  async function authorize(db, agencyId, actor, { ownerOnly = false, mutate = false } = {}) {
    const [[current]] = await db.execute('SELECT id,role,is_active,is_archived FROM users WHERE id=?', [Number(actor?.id)]);
    if (!current || !Number(current.is_active) || Number(current.is_archived)) throw fail(403, 'Administrator access required.');
    if (current.role === 'super_admin') return current;
    if (ownerOnly || !(mutate ? ['admin'] : ['admin','support']).includes(current.role)) throw fail(403, 'Administrator access required.');
    const [[membership]] = await db.execute('SELECT agency_role FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1', [current.id, Number(agencyId)]);
    if (!membership || (membership.agency_role && !['admin','support'].includes(membership.agency_role))) throw fail(403, 'Organization administrator access required.');
    if (mutate && membership.agency_role && membership.agency_role !== 'admin') throw fail(403, 'Organization administrator access required.');
    return current;
  }
  async function track(db, demoId, entityType, entityId, fixtureKey, recordKind, sourceId = null, metadata = {}) {
    await insert(db, 'prospect_demo_records', { demo_id: demoId, entity_type: entityType, entity_id: entityId,
      fixture_key: fixtureKey, record_kind: recordKind, source_entity_id: sourceId, metadata_json: JSON.stringify(metadata) });
  }
  async function collectDerivedFixtures(db, demo, records) {
    const clientIds = records.filter(r => r.entity_type === 'client' && r.record_kind === 'fixture').map(r => Number(r.entity_id));
    if (!clientIds.length) return records;
    const known = new Set(records.map(r => `${r.entity_type}:${r.entity_id}`));
    async function collect(type, rows) {
      for (const row of rows) {
        if (Number(row.agency_id) !== Number(demo.agency_id)) throw fail(409,'Activity on a sample client belongs to another organization. Review before cleanup.');
        const key = `${type}:${row.id}`;
        if (!known.has(key)) { await track(db,demo.id,type,Number(row.id),`derived:${key}`,'fixture');known.add(key); }
      }
    }
    const [appointments] = await db.execute(`SELECT DISTINCT a.id,a.agency_id FROM appointments a
      JOIN appointment_participants p ON p.appointment_id=a.id WHERE p.client_id IN (${marks(clientIds)}) FOR UPDATE`,clientIds);
    if (appointments.length) {
      const ids=appointments.map(a=>a.id);
      const [participants]=await db.execute(`SELECT p.id,p.client_id,a.agency_id FROM appointment_participants p
        JOIN appointments a ON a.id=p.appointment_id WHERE a.id IN (${marks(ids)}) FOR UPDATE`,ids);
      if (participants.some(p => p.client_id && !clientIds.includes(Number(p.client_id)))) throw fail(409,'A sample appointment includes another client. Review before cleanup.');
      await collect('appointment',appointments);await collect('participant',participants);
    }
    const [drafts]=await db.execute(`SELECT id,agency_id FROM clinical_note_drafts WHERE client_id IN (${marks(clientIds)}) FOR UPDATE`,clientIds);
    await collect('draft',drafts);
    const [remaining] = await db.execute('SELECT * FROM prospect_demo_records WHERE demo_id=? AND removed_at IS NULL FOR UPDATE',[demo.id]);
    return remaining;
  }
  async function provision(research, input) {
    const plan = prospectPlan(research, input);
    if (!plan.name || !Number.isSafeInteger(plan.actorUserId) || !plan.actorUserId) throw fail(400, 'Organization name and provisioning actor are required.');
    const passwordHash = await hashPassword(crypto.randomBytes(48).toString('hex'));
    return tx(async db => {
      await authorize(db, 0, { id: plan.actorUserId }, { ownerOnly: true });
      const [[existing]] = await db.execute('SELECT id,agency_id,status FROM prospect_demo_instances WHERE slug=? FOR UPDATE', [plan.slug]);
      if (existing) return { applied: false, existing: true, agencyId: Number(existing.agency_id), demoId: Number(existing.id), status: existing.status };
      const [[collision]] = await db.execute('SELECT id FROM agencies WHERE slug=?', [plan.slug]);
      if (collision) throw fail(409, 'This organization slug already exists outside the prospect ledger.');
      const [[source]] = await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0', [plan.sourceAgencyId]);
      if (!source || json(source.feature_flags).qaSandbox?.syntheticOnly !== true) throw fail(409, 'Select an explicitly synthetic QA source organization.');
      const [templates] = await db.execute(`SELECT id,full_name,initials,date_of_birth,grade,preferred_language
        FROM clients WHERE agency_id=? AND is_demo=1 AND status<>'ARCHIVED' ORDER BY id LIMIT 200`, [source.id]);
      if (!templates.length) throw fail(409, 'The selected QA organization has no synthetic client templates.');
      for (const p of plan.providers) {
        const [[collision]] = await db.execute(`SELECT id FROM users WHERE LOWER(email)=? OR LOWER(username)=? OR LOWER(work_email)=? OR LOWER(personal_email)=?
          UNION SELECT user_id AS id FROM user_login_emails WHERE LOWER(email)=? LIMIT 1`, Array(5).fill(p.email));
        if (collision) throw fail(409, `An account already uses ${p.email}. Connect an existing identity explicitly.`);
      }
      const flags = { prospectDemo: { status: 'DEMO', seedVersion: PROSPECT_SEED_VERSION, syntheticOnly: true },
        tenantFeatureProfileKey: 'mental_health', hiringEnabled: true, peopleOpsEnabled: true,
        clinicalChartEnabled: true, medicalBillingEnabled: true, clinicalNoteGeneratorEnabled: true,
        publicProviderFinderEnabled: true, billingAccountExcluded: true,
        googleSsoEnabled: false, workspaceProvisioningEnabled: false, managedWorkspaceGroupsEnabled: false,
        claimMdEnabled: false, smsNumbersEnabled: false, smsAutoProvisionOnPrehire: false };
      const agencyId = await insert(db, 'agencies', { name: plan.name, official_name: plan.officialName, slug: plan.slug,
        portal_url: plan.slug, organization_type: 'agency', is_active: 1, is_archived: 0, logo_url: plan.logoUrl,
        color_palette: JSON.stringify({ primary: '#18324c', secondary: '#5ea2e7', accent: '#d3ab61' }),
        feature_flags: JSON.stringify(flags), theme_settings: JSON.stringify({ primaryColor: '#18324c', secondaryColor: '#5ea2e7' }),
        public_availability_enabled: 1, timezone: 'America/Denver', website_url: research.meta?.primary_url || null,
        phone_number: val(research.contact?.phone) || null,
        careers_page_json: JSON.stringify({ headline: `Build your next chapter at ${plan.name}`, intro: 'Explore a demonstration of a connected careers and hiring experience.', logoUrl: plan.logoUrl }) });
      const demoId = await insert(db, 'prospect_demo_instances', { agency_id: agencyId, slug: plan.slug,
        provider_alias: plan.providerAlias, careers_alias: plan.careersAlias, research_json: JSON.stringify(research),
        source_agency_id: source.id, created_by_user_id: plan.actorUserId, seed_version: PROSPECT_SEED_VERSION });
      await db.execute("INSERT INTO agency_business_types(agency_id,business_type,is_enabled,sort_order) VALUES(?,'mental_health',1,0)",[agencyId]);
      // Configure the existing AuricWell system mailbox for a later, explicitly
      // requested invitation. Provisioning never generates a token or sends mail.
      await db.execute(`INSERT INTO email_sender_identities(agency_id,identity_key,display_name,from_email,reply_to,is_active)
        VALUES(?,'prospect_demo_access',?,'portal@auricwell.com','technology@auricwell.com',1)`,[agencyId,`AuricWell · ${plan.name}`]);
      const offices = [];
      for (const [i, location] of (research.locations || []).entries()) {
        const address = location.address || location;
        const officeId = await insert(db, 'office_locations', { agency_id: agencyId,
          name: String(val(location.name) || location.label || `Office ${i + 1}`),
          street_address: val(address.street_address) || val(address.street) || val(location.street_address) || null,
          city: val(address.city) || 'Colorado Springs', state: val(address.state) || 'CO',
          postal_code: val(address.postal_code) || val(address.zip) || null, timezone: 'America/Denver',
          access_key: crypto.randomBytes(24).toString('hex'), is_active: 1 });
        await db.execute('INSERT INTO office_location_agencies(office_location_id,agency_id) VALUES(?,?)', [officeId, agencyId]);
        await track(db, demoId, 'office', officeId, `office:${i}`, 'configuration');
        offices.push({ id: officeId, name: String(val(location.name) || '') });
      }
      const providerIds = [];
      for (const [i, p] of plan.providers.entries()) {
        const isOwner = i === plan.ownerIndex;
        const id = await insert(db, 'users', { email: p.email, username: p.email, work_email: p.email,
          personal_email: null, first_name: p.firstName, last_name: p.lastName,
          role: isOwner ? 'admin' : 'provider', status: 'DEMO', is_demo: 1, is_active: 1, is_archived: 0,
          password_hash: passwordHash, credential: p.credential, title: p.title_role || 'Counseling provider',
          service_focus: (p.specialties || []).join(', '), provider_school_info_blurb: p.short_bio_summary || null,
          work_location: p.office || null, timezone: 'America/Denver', sees_clients: 1, has_provider_access: 1,
          provider_accepting_new_clients: 0, in_office_available: /telehealth/i.test(p.office || '') ? 0 : 1,
          identity_product: 'full_suite', sso_password_override: 0, login_is_group_email: 0 });
        providerIds.push(id);
        await db.execute('INSERT INTO user_agencies(user_id,agency_id,is_active,is_default,agency_role) VALUES(?,?,1,1,?)', [id, agencyId, isOwner ? 'admin' : 'provider']);
        await db.execute('INSERT INTO user_preferences(user_id,timezone,sms_enabled,sms_forwarding_enabled,sms_support_mirror_enabled) VALUES(?,?,0,0,0)', [id, 'America/Denver']);
        await track(db, demoId, 'provider', id, `provider:${i}`, 'configuration', null, { temporaryEmail: !isOwner || !input.ownerEmail, sourceUrl: p.source_url });
        const profileId = await insert(db, 'provider_public_profiles', { user_id: id,
          public_blurb: p.short_bio_summary || null, self_pay_rate_cents: plan.selfPayRateCents,
          self_pay_rate_note: 'Website-listed self-pay session rate; confirm current terms with the practice.',
          public_details_json: JSON.stringify({ prospectDemo: { demoId, sourceUrl: p.source_url, sourceDate: p.collection_date,
            listedCredentials: p.website_listed_credentials || [], office: p.office || null, specialties: p.specialties || [],
            populations: p.populations || [], modalities: p.modalities || [], notes: p.notes || null } }) });
        await track(db, demoId, 'profile', profileId, `profile:${i}`, 'configuration');
        await db.execute("INSERT INTO provider_public_service_enrollments(agency_id,user_id,service_type,is_active) VALUES(?,?,'counseling',1)", [agencyId, id]);
        const office = offices.find(o => o.name === p.office);
        if (office) await db.execute('INSERT INTO user_office_locations(user_id,office_location_id) VALUES(?,?)', [id, office.id]);
        for (const [j, day] of ['Monday', 'Wednesday', 'Friday'].entries()) {
          const availabilityId = await insert(db, 'provider_virtual_working_hours', { agency_id: agencyId,
            provider_id: id, day_of_week: day, start_time: `${String(9 + (i % 3) + j).padStart(2, '0')}:00:00`,
            end_time: `${String(11 + (i % 3) + j).padStart(2, '0')}:00:00`,
            session_type: 'REGULAR', frequency: 'WEEKLY', purpose: 'ONGOING', available_for_intake: 1, available_for_session: 1 });
          await track(db, demoId, 'availability', availabilityId, `availability:${i}:${j}`, 'fixture');
        }
      }
      await db.execute('UPDATE agencies SET account_owner_user_id=? WHERE id=?', [providerIds[plan.ownerIndex], agencyId]);
      await db.execute("INSERT INTO agency_public_service_types(agency_id,service_type,display_name,intro_blurb,is_enabled) VALUES(?,'counseling','Counseling',?,1)", [agencyId, `Meet the ${plan.name} team.`]);
      await db.execute('INSERT INTO agency_billing_accounts(agency_id,autopay_enabled,feature_entitlements_json) VALUES(?,0,?)',
        [agencyId, JSON.stringify({ publicAvailability: { enabled: true, reason: 'Prospect demonstration only; no subscription or charges activated.' } })]);
      const clientIds = [], assignmentOrder = [...providerIds];
      for (let i = assignmentOrder.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1); [assignmentOrder[i], assignmentOrder[j]] = [assignmentOrder[j], assignmentOrder[i]];
      }
      const fixtureCount = Math.max(plan.fixtureCount, templates.length);
      for (let i = 0; i < fixtureCount; i++) {
        const source = templates[i % templates.length], providerId = assignmentOrder[i % assignmentOrder.length];
        const displayName = source.full_name || `Sample client ${i + 1}`;
        const id = await insert(db, 'clients', { organization_id: agencyId, agency_id: agencyId, provider_id: providerId,
          full_name: displayName, initials: source.initials || displayName.split(/\s+/).map(w => w[0]).join('').slice(0, 8),
          date_of_birth: source.date_of_birth || null, grade: source.grade || null, preferred_language: source.preferred_language || null,
          identifier_code: `${plan.slug.toUpperCase()}-DEMO-${String(i + 1).padStart(3, '0')}`, status: 'ACTIVE',
          submission_date: new Date().toISOString().slice(0, 10), client_type: 'clinical', source: 'ADMIN_CREATED',
          is_demo: 1, guardian_portal_enabled: 0, session_email_opt_in: 0, session_sms_opt_in: 0,
          session_phone_opt_in: 0, created_by_user_id: plan.actorUserId,
          internal_notes: 'Synthetic prospect demonstration. Copied fictional demographics only; no QA clinical history, guardians, contacts or other tenant affiliations.' });
        clientIds.push(id);
        await db.execute('INSERT INTO client_agency_assignments(client_id,agency_id,is_primary,is_active) VALUES(?,?,1,1)', [id, agencyId]);
        await track(db, demoId, 'client', id, `client:${i}`, 'fixture', source.id);
        const assignmentId = await insert(db, 'client_provider_assignments', { client_id: id, organization_id: agencyId,
          provider_user_id: providerId, is_primary: 1, is_active: 1, created_by_user_id: plan.actorUserId });
        await track(db, demoId, 'assignment', assignmentId, `assignment:${i}`, 'fixture');
        const day = new Date(); day.setUTCDate(day.getUTCDate() + 1 + (i % 10)); day.setUTCHours(16 + (i % 6), 0, 0, 0);
        const end = new Date(day.getTime() + 53 * 60000);
        const appointmentId = await insert(db, 'appointments', { agency_id: agencyId, provider_user_id: providerId,
          start_at: day.toISOString().slice(0, 19).replace('T', ' '), end_at: end.toISOString().slice(0, 19).replace('T', ' '),
          status: 'confirmed', modality: 'VIRTUAL', source: 'prospect_demo', title: 'Sample counseling session',
          service_code: '90837', created_by_user_id: plan.actorUserId, notification_mode: 'none', source_timezone: 'America/Denver' });
        await track(db, demoId, 'appointment', appointmentId, `appointment:${i}`, 'fixture');
        const participantId = await insert(db, 'appointment_participants', { appointment_id: appointmentId,
          role: 'client', client_id: id, receives_reminders: 0, display_name: displayName });
        await track(db, demoId, 'participant', participantId, `participant:${i}`, 'fixture');
      }
      const jobs = [
        { title: 'Licensed Professional Counselor', schedule: 'Full-time or part-time · In person / telehealth',
          text: 'Example role for an independently licensed counselor supporting individuals and families. Demonstrates application review, interviews and onboarding. Colorado clinical licensure, collaborative communication and thoughtful documentation would be relevant qualifications.' },
        { title: 'Prelicensed Counselor / LPCC', schedule: 'Part-time · Colorado Springs',
          text: 'Example supervised counseling role for a clinician developing a caseload and clinical skills. Demonstrates credential review, supervision planning and a personalized onboarding checklist. This is a fictional position; no employment offer or supervision arrangement is represented.' },
        { title: 'Client Care Coordinator', schedule: 'Full-time · Colorado Springs',
          text: 'Example administrative role supporting appointment coordination, intake paperwork and a welcoming client experience. Demonstrates an administrative hiring pipeline and training plan. This is a fictional position; compensation and actual hiring needs have not been provided by the organization.' }
      ];
      for (const [i, job] of jobs.entries()) {
        const id = await insert(db, 'hiring_job_descriptions', { agency_id: agencyId, title: job.title,
          description_text: `DEMONSTRATION ONLY — NOT AN ACTUAL VACANCY.\n\n${job.text}`,
          city: 'Colorado Springs', state: 'CO', schedule_text: job.schedule, is_active: 1,
          created_by_user_id: providerIds[plan.ownerIndex], posted_date: new Date().toISOString().slice(0, 10),
          tags_json: JSON.stringify(['Demonstration only', 'Not an actual vacancy']), role_type: 'provider' });
        await track(db, demoId, 'job', id, `job:${i}`, 'fixture');
      }
      await audit(db, plan.actorUserId, agencyId, 'prospect_demo_created', { demoId, seedVersion: PROSPECT_SEED_VERSION,
        providerCount: providerIds.length, clientCount: clientIds.length, sourceAgencyId: source.id });
      return { applied: true, agencyId, demoId, status: 'DEMO', ownerUserId: providerIds[plan.ownerIndex], providerIds, clientIds,
        providerUrl: `https://auricwell.com/${plan.providerAlias}`, careersUrl: `https://plotlinepo.com/${plan.careersAlias}`,
        workspaceUrl: `https://auricwell.com/app/${plan.slug}`, loginUrl: `https://auricwell.com/${plan.slug}/login` };
    });
  }
  async function summary(agencyId, actor) {
    const current = await authorize(database, agencyId, actor);
    const demo = await instance(database, agencyId);
    const [records] = await database.execute(`SELECT entity_type,record_kind,COUNT(*) AS count FROM prospect_demo_records
      WHERE demo_id=? AND removed_at IS NULL GROUP BY entity_type,record_kind`, [demo.id]);
    const [providers] = await database.execute(`SELECT u.id,u.first_name,u.last_name,u.email,u.credential,u.role,u.status,
      u.work_location FROM users u JOIN prospect_demo_records r ON r.entity_id=u.id AND r.entity_type='provider'
      WHERE r.demo_id=? AND r.removed_at IS NULL ORDER BY u.last_name,u.first_name`, [demo.id]);
    return { id: demo.id, agencyId: demo.agency_id, name: demo.name, slug: demo.slug, status: demo.status,
      fixturesClearedAt: demo.fixtures_cleared_at, records, providers,
      providerUrl: `https://auricwell.com/${demo.provider_alias}`, careersUrl: `https://plotlinepo.com/${demo.careers_alias}`,
      usersUrl: `/${demo.slug}/admin/users`, hiringUrl: `https://plotlinepo.com/app/${demo.slug}/admin/careers/jobs`,
      canManage: ['admin','super_admin'].includes(current.role), notice: demo.status === 'DEMO' ? DEMO_NOTICE : null };
  }
  async function publicPage(alias, surface) {
    if (!['providers','careers'].includes(surface)) throw fail(404, 'Page not found.');
    const field = surface === 'providers' ? 'provider_alias' : 'careers_alias';
    const [[row]] = await database.execute(`SELECT d.agency_id FROM prospect_demo_instances d
      JOIN agencies a ON a.id=d.agency_id WHERE d.${field}=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`, [slug(alias, 100)]);
    if (!row) throw fail(404, 'Organization page not found.');
    const demo = await instance(database, row.agency_id);
    const [providers] = await database.execute(`SELECT u.id,u.first_name,u.last_name,u.credential,u.title,u.work_location,
      p.public_blurb,p.public_details_json FROM prospect_demo_records r JOIN users u ON u.id=r.entity_id
      LEFT JOIN provider_public_profiles p ON p.user_id=u.id
      WHERE r.demo_id=? AND r.entity_type='provider' AND r.removed_at IS NULL
      AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 ORDER BY u.last_name,u.first_name`, [demo.id]);
      const [jobs] = await database.execute(`SELECT j.id,j.title,j.description_text,j.city,j.state,j.schedule_text,
        (SELECT il.public_key FROM intake_links il WHERE il.job_description_id=j.id AND il.form_type='job_application'
          AND il.is_active=1 ORDER BY il.id DESC LIMIT 1) AS application_key FROM hiring_job_descriptions j
      WHERE agency_id=? AND is_active=1 AND (publish_at IS NULL OR publish_at<=UTC_TIMESTAMP())
      AND (unpublish_at IS NULL OR unpublish_at>UTC_TIMESTAMP()) ORDER BY id`, [demo.agency_id]);
    const [availability] = await database.execute(`SELECT v.id,v.provider_id,v.day_of_week,v.start_time,v.end_time FROM provider_virtual_working_hours v
      JOIN prospect_demo_records r ON r.entity_id=v.id AND r.entity_type='availability' AND r.removed_at IS NULL
      WHERE r.demo_id=? AND v.agency_id=?`, [demo.id, demo.agency_id]);
    const [offices] = await database.execute('SELECT id,name,street_address,city,state,postal_code FROM office_locations WHERE agency_id=? AND is_active=1', [demo.agency_id]);
    return { name: demo.name, slug: demo.slug, status: demo.status, logoUrl: demo.logo_url,
      notice: demo.status === 'DEMO' ? DEMO_NOTICE : null, offices,
      providers: providers.map(p => ({ id: p.id, name: nameOf(p), credential: p.credential, title: p.title,
        office: p.work_location, bio: p.public_blurb, details: json(p.public_details_json).prospectDemo || {},
        availability: demo.status === 'DEMO' ? availability.filter(a => Number(a.provider_id) === Number(p.id)) : [] })),
      jobs: jobs.map(j => ({ ...j, isExample: demo.status === 'DEMO', applicationUrl: demo.status === 'LIVE' && j.application_key ? `/intake/${j.application_key}` : null, application_key: undefined })),
      workspaceUrl: `https://auricwell.com/app/${demo.slug}`, loginUrl: `https://auricwell.com/${demo.slug}/login` };
  }
  async function updateEmployee(agencyId, userId, newEmail, actor, { connection = null } = {}) {
    const nextEmail = email(newEmail);
    if (isTemporaryDemoEmail(nextEmail) || /\.(?:invalid|example|test)$/i.test(nextEmail)) throw fail(400, 'Enter the employee’s real email.');
    return tx(async db => {
      await authorize(db, agencyId, actor, {mutate:true});
      const demo = await instance(db, agencyId, true);
      const [[owned]] = await db.execute(`SELECT u.* FROM prospect_demo_records r JOIN users u ON u.id=r.entity_id
        WHERE r.demo_id=? AND r.entity_type='provider' AND r.entity_id=? AND r.removed_at IS NULL FOR UPDATE`, [demo.id, Number(userId)]);
      if (!owned) throw fail(404, 'Employee not found in this organization.');
      const [memberships] = await db.execute('SELECT agency_id FROM user_agencies WHERE user_id=?', [owned.id]);
      if (memberships.some(m => Number(m.agency_id) !== Number(agencyId))) throw fail(409, 'This account has other memberships; review its identity before changing it.');
      const [collisions] = await db.execute(`SELECT id FROM users WHERE id<>? AND
        (LOWER(email)=? OR LOWER(work_email)=? OR LOWER(username)=? OR LOWER(personal_email)=?)
        UNION SELECT user_id AS id FROM user_login_emails WHERE user_id<>? AND LOWER(email)=?`, [owned.id, ...Array(4).fill(nextEmail), owned.id, nextEmail]);
      if (collisions.length) throw fail(409, 'This address already belongs to another account.');
      if (owned.email === nextEmail && !isTemporaryDemoEmail(owned.work_email) && !isTemporaryDemoEmail(owned.username)) return {id:owned.id,email:nextEmail,status:owned.status};
      if (!isTemporaryDemoEmail(owned.email) && owned.email !== nextEmail) throw fail(409, 'This employee already has a real address. Use the standard account editor for subsequent changes.');
      await db.execute(`UPDATE users SET email=?,username=?,work_email=?,password_hash=NULL,
        personal_email=CASE WHEN personal_email LIKE '%.demo.invalid' THEN NULL ELSE personal_email END,
        passwordless_token=NULL,passwordless_token_expires_at=NULL,passwordless_token_purpose=NULL,
        invitation_token=NULL,invitation_token_expires_at=NULL,temporary_password_hash=NULL,
        temporary_password_expires_at=NULL,email_verified_at=NULL,email_verification_token=NULL,
        email_verification_token_expires_at=NULL WHERE id=?`, [nextEmail, nextEmail, nextEmail, owned.id]);
      await db.execute("DELETE FROM user_login_emails WHERE user_id=? AND email LIKE '%.demo.invalid'", [owned.id]);
      await db.execute('UPDATE auth_session_security SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [owned.id]);
      await db.execute(`INSERT INTO user_auth_revocations(user_id,reject_issued_before,revoked_at,revoked_by_user_id)
        VALUES(?,UNIX_TIMESTAMP()+1,UTC_TIMESTAMP(3),?) ON DUPLICATE KEY UPDATE
        reject_issued_before=VALUES(reject_issued_before),revoked_at=VALUES(revoked_at),revoked_by_user_id=VALUES(revoked_by_user_id)`, [owned.id,actor.id]);
      await db.execute('UPDATE quick_view_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[owned.id]);
      await db.execute('UPDATE account_mfa_devices SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[owned.id]);
      await db.execute('DELETE FROM account_mfa_sessions WHERE user_id=?',[owned.id]);
      await audit(db, actor.id, agencyId, 'prospect_employee_email_assigned', { demoId: demo.id, userId: owned.id, previousEmail: owned.email, email: nextEmail });
      return { id: owned.id, email: nextEmail, status: owned.status };
    }, connection);
  }
  async function clearFixtures(agencyId, actor, { activate = false, confirmSlug } = {}) {
    return tx(async db => {
      await authorize(db, agencyId, actor, {mutate:true});
      const demo = await instance(db, agencyId, true);
      if (confirmSlug !== demo.slug) throw fail(400, 'Enter the organization slug to confirm cleanup.');
      if (demo.status !== 'DEMO') throw fail(409, 'This organization has already switched to live.');
      const [initialRecords] = await db.execute('SELECT * FROM prospect_demo_records WHERE demo_id=? AND removed_at IS NULL FOR UPDATE', [demo.id]);
      const records = await collectDerivedFixtures(db,demo,initialRecords);
      const providerIds = records.filter(r => r.entity_type === 'provider').map(r => Number(r.entity_id));
      const [sharedProviders] = await db.execute(`SELECT user_id FROM user_agencies WHERE user_id IN (${marks(providerIds)}) AND agency_id<>?`,[...providerIds,Number(agencyId)]);
      if (sharedProviders.length) throw fail(409,'A provider account is shared with another organization. Review before cleanup or activation.');
      if (activate) {
        const [untrackedClients] = await db.execute(`SELECT c.id FROM clients c WHERE c.agency_id=? AND c.is_demo=1
          AND NOT EXISTS(SELECT 1 FROM prospect_demo_records r WHERE r.demo_id=? AND r.entity_type='client' AND r.entity_id=c.id AND r.removed_at IS NULL)`,[Number(agencyId),demo.id]);
        if (untrackedClients.length) throw fail(409,'Additional demonstration clients need review before live activation.');
        const [users] = await db.execute(`SELECT id,email FROM users WHERE id IN (${marks(providerIds)})`, providerIds);
        if (users.some(u => isTemporaryDemoEmail(u.email))) throw fail(409, 'Assign real email addresses to all providers before switching to live. You can clear sample data separately.');
      }
      // Never discover deletions by name or blanket agency queries. Only this
      // instance's ledger-owned fixtures can be removed.
      const counts = {};
      for (const type of DELETE_ORDER) {
        const owned = records.filter(r => r.entity_type === type && r.record_kind === 'fixture');
        for (const record of owned) {
          const table = OWNED_TABLES[type];
          const scopeSql = {
            participant: 'SELECT a.agency_id FROM appointment_participants p JOIN appointments a ON a.id=p.appointment_id WHERE p.id=? FOR UPDATE',
            assignment: 'SELECT c.agency_id FROM client_provider_assignments p JOIN clients c ON c.id=p.client_id WHERE p.id=? FOR UPDATE',
            appointment: 'SELECT agency_id FROM appointments WHERE id=? FOR UPDATE',
            client: 'SELECT agency_id FROM clients WHERE id=? FOR UPDATE',
            availability: 'SELECT agency_id FROM provider_virtual_working_hours WHERE id=? FOR UPDATE',
            job: 'SELECT agency_id FROM hiring_job_descriptions WHERE id=? FOR UPDATE',
            draft: 'SELECT agency_id FROM clinical_note_drafts WHERE id=? FOR UPDATE',
            candidate: 'SELECT agency_id FROM user_agencies WHERE user_id=? AND is_active=1 FOR UPDATE'
          }[type];
          const [scopes] = await db.execute(scopeSql, [record.entity_id]);
          if (scopes.some(row => Number(row.agency_id) !== Number(agencyId))) throw fail(409, 'A sample record belongs to another organization. Review before cleanup.');
          if (type === 'client') {
            const [[client]] = await db.execute('SELECT agency_id,is_demo FROM clients WHERE id=? FOR UPDATE', [record.entity_id]);
            if (client && (Number(client.agency_id) !== Number(agencyId) || !Number(client.is_demo))) throw fail(409, 'A sample client’s ownership changed. Review before cleanup.');
            const [otherAffiliations] = await db.execute(`SELECT client_id FROM client_agency_assignments WHERE client_id=? AND agency_id<>?
              UNION SELECT client_id FROM client_organization_assignments WHERE client_id=? AND organization_id<>?
              UNION SELECT client_id FROM client_provider_assignments WHERE client_id=? AND organization_id<>?
              UNION SELECT client_id FROM client_service_enrollments WHERE client_id=? AND (agency_id<>? OR (organization_id IS NOT NULL AND organization_id<>?))`,
              [record.entity_id,Number(agencyId),record.entity_id,Number(agencyId),record.entity_id,Number(agencyId),record.entity_id,Number(agencyId),Number(agencyId)]);
            if (otherAffiliations.length) throw fail(409,'A sample client has affiliations outside this organization. Review before cleanup.');
            await db.execute('DELETE FROM client_service_enrollments WHERE client_id=? AND agency_id=?',[record.entity_id,Number(agencyId)]);
            await db.execute('DELETE FROM client_agency_assignments WHERE client_id=? AND agency_id=?', [record.entity_id, Number(agencyId)]);
          }
          const [deleted] = await db.execute(`DELETE FROM ${table} WHERE id=?`, [record.entity_id]);
          counts[type] = (counts[type] || 0) + Number(deleted.affectedRows);
          await db.execute('UPDATE prospect_demo_records SET removed_at=UTC_TIMESTAMP() WHERE id=?', [record.id]);
        }
      }
      if (activate) {
        await db.execute(`UPDATE users SET status='ACTIVE_EMPLOYEE',is_demo=0,sso_password_override=0
          WHERE id IN (${marks(providerIds)}) AND status='DEMO'`, providerIds);
        const flags = { ...demo.feature_flags, prospectDemo: { ...demo.feature_flags.prospectDemo, status: 'LIVE', syntheticOnly: false } };
        await db.execute('UPDATE agencies SET feature_flags=? WHERE id=?', [JSON.stringify(flags), Number(agencyId)]);
        await db.execute("UPDATE prospect_demo_instances SET status='LIVE',activated_at=UTC_TIMESTAMP(),fixtures_cleared_at=UTC_TIMESTAMP() WHERE id=?", [demo.id]);
      } else await db.execute('UPDATE prospect_demo_instances SET fixtures_cleared_at=UTC_TIMESTAMP() WHERE id=?', [demo.id]);
      await audit(db, actor.id, agencyId, activate ? 'prospect_demo_activated' : 'prospect_demo_fixtures_cleared', { demoId: demo.id, counts });
      return { status: activate ? 'LIVE' : 'DEMO', removed: counts, retainedProviders: providerIds.length };
    });
  }
  return { provision, summary, publicPage, updateEmployee, clearFixtures, authorize };
}
