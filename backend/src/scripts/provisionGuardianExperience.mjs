// Explicit, synthetic guardian fixture. This script never sends messages or
// creates processor objects. Guardian access expires in seven days; fixture
// records remain demo-marked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { seedGuardianExperienceClinical } from './guardianExperienceClinicalFixture.mjs';
import { seedGuardianExperienceFinancial } from './guardianExperienceFinancialFixture.mjs';
import { buildIntakePayloadEnvelope, encryptIntakePayload } from '../services/intakeResponsesEncryption.service.js';
import { encryptGuardianIntake } from '../services/guardianIntakeEncryption.service.js';
import { encryptDemographicsPayload } from '../services/demographicsImport.service.js';
import { encryptFamilyBilling } from '../services/familyBillingEncryption.service.js';

export const fixture = Object.freeze({
  run: 'bennett20261020',
  guardianEmail: 'guardian-test-bennett-20261020@example.com',
  guardianName: 'Alex Bennett (Demo)',
  clients: [
    { firstName: 'Riley', name: 'Riley Bennett — DEMO', dob: '2015-06-15', agencyId: 2, organizationId: 2, setting: 'office', clientType: 'clinical', grade: '6' },
    { firstName: 'Jordan', name: 'Jordan Bennett — DEMO', dob: '2017-08-20', agencyId: 6, organizationId: 6, setting: 'office', clientType: 'clinical', grade: '3' },
    { firstName: 'Avery', name: 'Avery Bennett — DEMO', dob: '2013-03-12', agencyId: 2, organizationId: 376, setting: 'school', clientType: 'school', grade: '8' }
  ]
});

const timestamp = value => value.toISOString().slice(0, 19).replace('T', ' ');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const address = { street: '123 Example Lane', city: 'Denver', state: 'CO', postalCode: '80202' };
const fakePhone = '+13035550147';
const clinicalScopes = ['treatment_plan', 'approve_goals', 'session_frequency', 'safety_plan', 'clinical_documents', 'clinical_messages'];

export function insuranceForDemoChild(client) {
  const primary = {
    insurerName: 'Summit Family Health — FICTIONAL DEMO',
    memberId: `DEMO-BENNETT-${client.firstName.toUpperCase()}`,
    groupNumber: 'DEMO-FAMILY-2026', subscriberName: 'Alex Bennett (Demo)',
    subscriberFirstName: 'Alex', subscriberLastName: 'Bennett (Demo)', subscriberDob: '1985-04-18',
    subscriberSex: 'U', relationshipToSubscriber: 'child',
    subscriberAddressLine1: address.street, subscriberCity: address.city,
    subscriberState: address.state, subscriberPostalCode: address.postalCode,
    planType: 'PPO', effectiveDate: '2026-01-01', isMedicaid: false
  };
  const secondary = client.setting === 'school' ? {
    insurerName: 'Medicaid — FICTIONAL DEMO ONLY', memberId: 'DEMO-MEDICAID-AVERY',
    subscriberName: client.name, subscriberFirstName: client.firstName,
    subscriberLastName: 'Bennett — DEMO', subscriberDob: client.dob,
    relationshipToSubscriber: 'self', isMedicaid: true, effectiveDate: '2026-01-01'
  } : null;
  return { primary, secondary };
}

export function enrollmentDataForDemoChild({ client, agency, now, communicationDisclosure }) {
  const coverage = insuranceForDemoChild(client);
  const guardian = {
    firstName: 'Alex', lastName: 'Bennett (Demo)', fullName: fixture.guardianName,
    dateOfBirth: '1985-04-18', email: fixture.guardianEmail, phone: fakePhone,
    relationship: 'Parent / legal guardian — fictional test', primaryLanguage: 'English'
  };
  const communicationPreferences = {
    version: communicationDisclosure.version, agencyId: Number(agency.id),
    brandName: communicationDisclosure.brandName,
    emailPreference: 'all', smsPreference: 'no', recipientPhone: null,
    signerName: fixture.guardianName, signatureAccepted: true,
    disclosure: communicationDisclosure.text, schoolDisclosure: communicationDisclosure.schoolText,
    disclosureHash: hash(JSON.stringify(communicationDisclosure)),
    signedAt: now.toISOString(), activationStatus: 'declined',
    fictionalDemo: true, fixtureRun: fixture.run,
    authorizationNote: 'Administrator requested reminder email testing for this fictional family only. No SMS or phone authorization.',
    termsUrl: 'https://app.itsco.health/terms', privacyUrl: 'https://app.itsco.health/privacy'
  };
  const child = {
    firstName: client.firstName, lastName: 'Bennett — DEMO', fullName: client.name,
    dateOfBirth: client.dob, preferredName: client.firstName, grade: client.grade,
    preferredLanguage: 'English', schoolName: client.setting === 'school' ? 'Hogwarts' : 'Example Community School (fictional)',
    fictionalDemo: true
  };
  return {
    fixtureRun: fixture.run, fictionalDemo: true, enrollmentCompleted: true,
    clients: [child], guardian,
    responses: {
      guardian,
      submission: {
        guardianName: fixture.guardianName, guardianEmail: fixture.guardianEmail,
        guardianPhone: fakePhone, addressStreet: address.street, addressCity: address.city,
        addressState: address.state, addressZip: address.postalCode,
        communicationPreferences,
        insuranceInfo: {
          ...coverage, isSelfPay: false, coverageScope: 'client', confirmed: true,
          clientCoverages: [{ clientIndex: 0, confirmed: true, ...coverage }],
          primary_front_url: null, primary_back_url: null,
          secondary_front_url: null, secondary_back_url: null,
          ...(coverage.secondary ? { medicaidPlanPosition: 'secondary', medicaidByClient: [{ clientIndex: 0, memberId: coverage.secondary.memberId }] } : {})
        },
        paymentInfo: { fictionalDemo: true, processorAuthorization: false, autoCharge: false }
      },
      clients: [{
        ...child, child_legal_first: client.firstName, child_legal_last: 'Bennett — DEMO',
        child_dob: client.dob, child_preferred_name: client.firstName,
        child_preferred_language: 'English',
        demographicsInfo: { dob: client.dob, preferredCalled: client.firstName, preferredLanguage: 'English',
          address: { street: address.street, city: address.city, state: address.state, zip: address.postalCode } },
        presentingConcerns: 'FICTIONAL TEST DATA: building confidence, coping with transitions, and practicing everyday communication.',
        strengths: 'Enjoys art, stories, puzzles, and spending time with family.',
        familyGoals: 'Feel comfortable asking for help and practice a predictable routine.',
        medicalNotes: 'FICTIONAL TEST DATA ONLY; no real medical history or assessment.',
        emergencyContact: { name: 'Morgan Bennett (Demo)', relationship: 'Fictional aunt', phone: '+13035550148' }
      }]
    }
  };
}

async function samplePacket(client, agency, now) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = [
    [
      `${agency.name} enrollment overview`,
      `Child: ${client.firstName} Bennett (Demo)`,
      `Guardian: ${fixture.guardianName}`,
      `Date of birth: ${client.dob} | Preferred language: English`,
      `Service setting: ${client.setting === 'school' ? 'Hogwarts school counseling' : 'Office counseling'}`,
      'Family goals: practice coping skills, communication, and predictable routines.',
      'Strengths: creativity, curiosity, and a supportive family.',
      'Primary coverage: Summit Family Health (fictional commercial policy).',
      'Insurance card photos: still needed for the commercial policy.',
      ...(client.setting === 'school' ? ['Secondary coverage: fictional Medicaid; do not request a Medicaid card.'] : []),
      'All contact details, coverage, services, and family information are invented.'
    ],
    [
      'Sample enrollment and consent acknowledgment',
      'This document is a portal testing artifact, not a real signed consent.',
      'It lets the administrator test viewing and downloading enrollment paperwork.',
      'The fictional family is linked to demo providers only.',
      'No actual medical care, insurer verification, or payment authorization occurred.',
      `Simulated acknowledgment name: ${fixture.guardianName}`,
      `Fixture prepared: ${now.toISOString().slice(0, 10)}`,
      'Email examples are requested for this demo family only.',
      'SMS and phone reminders are disabled.',
      'Card details are a display-only expired example; no card can be charged.'
    ]
  ];
  for (const lines of pages) {
    const page = pdf.addPage([612, 792]);
    page.drawText('FICTIONAL TEST DATA - NOT A REAL CLINICAL RECORD', { x: 36, y: 754, font: bold, size: 12, color: rgb(0.65, 0.12, 0.12) });
    lines.forEach((line, index) => page.drawText(line, { x: 36, y: 712 - index * 29, font: index === 0 ? bold : font, size: index === 0 ? 15 : 10 }));
    page.drawText(`Fixture ${fixture.run} - no real patient information`, { x: 36, y: 36, font, size: 9 });
  }
  return Buffer.from(await pdf.save());
}

export async function provisionGuardianExperience({ db, clinicalDb, password, now = new Date(), deps, journal = () => {} }) {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new Error('GUARDIAN_TEST_PASSWORD must contain 8-72 UTF-8 bytes.');
  }
  const expiresAt = new Date(+now + 7 * 24 * 3600000);
  const created = { run: fixture.run, status: 'preparing', actorId: null, guardian: null, clients: [],
    appointments: [], storagePaths: [], expiresAt: expiresAt.toISOString(), mainCommitted: false, clinicalCommitted: false };
  let lockHeld = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,10) AS acquired', [`guardian-experience:${fixture.run}`]);
    if (Number(lock?.acquired) !== 1) throw new Error('Another provisioning run is active.');
    lockHeld = true;
    const [[existing]] = await db.execute('SELECT id FROM users WHERE LOWER(email)=? LIMIT 1', [fixture.guardianEmail]);
    if (existing) throw new Error('The Bennett demo already exists. Reuse its original private output; this script never resets or duplicates it.');
    const [[actor]] = await db.execute("SELECT id FROM users WHERE LOWER(email)='michael@plottwistco.com' AND role='super_admin' AND is_active=1");
    const [agencies] = await db.execute("SELECT id,name,slug,official_name FROM agencies WHERE is_active=1 AND ((id=2 AND slug='itsco') OR (id=6 AND slug='nlu') OR (id=376 AND slug='hogwarts'))");
    if (!actor || agencies.length !== 3) throw new Error('Expected administrator or fixture agency/school identity is unavailable.');
    created.actorId = actor.id;
    // Validate encryption before any insert or object upload.
    encryptIntakePayload({ fictionalDemo: true });
    encryptGuardianIntake('{}');
    encryptFamilyBilling({ fictionalDemo: true }, `fixture:${fixture.run}`);
    encryptDemographicsPayload({ fictionalDemo: true });
    const temporaryHash = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString('hex');
    await db.beginTransaction();
    await clinicalDb.beginTransaction();
    const [guardianRow] = await db.execute(`INSERT INTO users
      (email,personal_email,username,first_name,last_name,role,status,is_active,is_demo,created_via_dev_fill,
       password_hash,temporary_password_hash,temporary_password_expires_at,temporary_password_set_at,
       passwordless_token,passwordless_token_expires_at,passwordless_token_purpose,status_expires_at,timezone)
      VALUES (?,?,?,'Alex','Bennett (Demo)','client_guardian','ACTIVE_EMPLOYEE',1,1,1,
       NULL,?,?,?,?,?,'setup',?,'America/Denver')`,
    [fixture.guardianEmail, fixture.guardianEmail, fixture.guardianEmail, temporaryHash, timestamp(expiresAt),
      timestamp(now), token, timestamp(expiresAt), timestamp(expiresAt)]);
    const guardianId = Number(guardianRow.insertId);
    created.guardian = { id: guardianId, email: fixture.guardianEmail, name: fixture.guardianName,
      setupUrl: `https://app.itsco.health/passwordless-login/${token}`, expiresAt: expiresAt.toISOString() };
    for (const agencyId of [2, 6]) {
      await db.execute('INSERT INTO user_agencies (user_id,agency_id,is_active) VALUES (?,?,1)', [guardianId, agencyId]);
    }
    journal(created);
    for (const definition of fixture.clients) {
      const client = { ...definition };
      const agency = agencies.find(row => Number(row.id) === client.agencyId);
      const initials = `${client.firstName.slice(0, 3).toUpperCase()}BEN`;
      const demographics = encryptDemographicsPayload({
        fictionalDemo: true, fixtureRun: fixture.run, fullName: client.name, dob: client.dob,
        guardianName: fixture.guardianName, address,
        strengths: 'Creative, curious, enjoys stories and puzzles', preferredLanguage: 'English'
      });
      const [clientRow] = await db.execute(`INSERT INTO clients
        (organization_id,agency_id,initials,full_name,preferred_name,date_of_birth,gender,status,submission_date,
         document_status,guardian_portal_enabled,client_type,source,is_demo,created_via_dev_fill,created_by_user_id,
         grade,school_year,preferred_language,primary_client_language,primary_parent_language,
         demographics_phi_enc,address_street,address_city,address_state,address_zip,internal_notes,
         session_email_opt_in,session_sms_opt_in,session_phone_opt_in,cleared_to_start,paperwork_received_at,intake_at)
        VALUES (?,?,?,?,?,?, 'Unknown','ACTIVE',?,'PACKET',1,?,?,1,1,?,?,?,?,?,?,?,?,?,?,?,?,1,0,0,1,?,?)`,
      [client.organizationId, client.agencyId, initials, client.name, client.firstName, client.dob,
        now.toISOString().slice(0, 10), client.clientType,
        client.setting === 'school' ? 'PUBLIC_INTAKE_LINK' : 'PUBLIC_OFFICE_INTAKE', actor.id,
        client.grade, '2026-2027', 'English', 'English', 'English', JSON.stringify(demographics),
        address.street, address.city, address.state, address.postalCode,
        `FICTIONAL DEMO FAMILY (${fixture.run}); no real patient, clinical care, insurer verification, or payment authorization.`,
        timestamp(now), now.toISOString().slice(0, 10)]);
      client.id = Number(clientRow.insertId);
      await db.execute('INSERT INTO client_agency_assignments (client_id,agency_id,is_primary,is_active) VALUES (?,?,1,1)', [client.id, client.agencyId]);
      await db.execute(`INSERT INTO client_guardians
        (client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id)
        VALUES (?,?,'guardian','Parent / legal guardian (demo)',1,?,?)`,
      [client.id, guardianId, JSON.stringify({ canViewDocs: true, canSignDocs: true, canViewLinks: true,
        canViewProgress: true, canMessage: true, fictionalDemo: true, fixtureRun: fixture.run }), actor.id]);
      await db.execute(`INSERT INTO guardian_clinical_grants
        (agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,
         evidence_encrypted,reviewed_by_user_id,review_due_date)
        VALUES (?,?,?,'full',1,'legal_representative',?,?,?,?)`,
      [client.agencyId, client.id, guardianId, JSON.stringify(clinicalScopes),
        encryptFamilyBilling({ fictionalDemo: true, fixtureRun: fixture.run,
          reason: 'Fictional portal testing authorization only; no real legal or medical rights determination.',
          scopes: clinicalScopes }, `clinical-grant:${client.agencyId}:${client.id}:${guardianId}`),
        actor.id, expiresAt.toISOString().slice(0, 10)]);
      const [template] = await db.execute(`INSERT INTO document_templates
        (name,description,template_type,document_type,document_action_type,is_user_specific,user_id,agency_id,
         organization_id,created_by_user_id,is_active,html_content)
        VALUES (?,?,'html','consent','review',1,?,?,?,?,0,?)`,
      [`${client.firstName} enrollment packet — FICTIONAL DEMO`, `Fixture ${fixture.run}; not a real signed consent.`,
        guardianId, client.agencyId, client.organizationId, actor.id,
        '<p>FICTIONAL TEST DATA — not a real signed consent. Sample portal enrollment packet.</p>']);
      const [link] = await db.execute(`INSERT INTO intake_links
        (public_key,title,description,scope_type,organization_id,is_active,create_client,create_guardian,
         requires_assignment,allowed_document_template_ids,intake_steps,created_by_user_id)
        VALUES (?,?,?,?,?,0,0,0,0,?,?,?)`,
      [crypto.randomBytes(24).toString('hex'), `${client.firstName} family experience — FICTIONAL DEMO`,
        `Private completed fixture ${fixture.run}; no public enrollment allowed.`, client.setting === 'school' ? 'school' : 'agency',
        client.organizationId, JSON.stringify([template.insertId]),
        JSON.stringify([{ id: 'sample_enrollment', type: 'document', templateId: template.insertId }]), actor.id]);
      const intakeData = enrollmentDataForDemoChild({ client, agency, now,
        communicationDisclosure: deps.intakeCommunicationDisclosure(agency) });
      const encrypted = encryptIntakePayload(buildIntakePayloadEnvelope({
        intakeData, signerName: fixture.guardianName, signerInitials: 'AB', signerEmail: fixture.guardianEmail, signerPhone: fakePhone
      }));
      const [submission] = await db.execute(`INSERT INTO intake_submissions
        (intake_link_id,status,intake_data_hash,payload_encrypted,payload_iv_b64,payload_auth_tag_b64,payload_key_id,
         consent_given_at,submitted_at,client_id,guardian_user_id,school_organization_id,reminder_consent_status,reminder_opt_out_at,user_agent)
        VALUES (?,'submitted',?,?,?,?,?,?,?,?,?,?,'declined',?,'guardian-experience-fixture')`,
      [link.insertId, hash(JSON.stringify(intakeData)), encrypted.ciphertext, encrypted.ivB64, encrypted.authTagB64,
        encrypted.keyId, timestamp(now), timestamp(now), client.id, guardianId,
        client.setting === 'school' ? client.organizationId : null, timestamp(now)]);
      client.submissionId = Number(submission.insertId);
      client.enrollmentId = client.submissionId;
      client.intakeLinkId = Number(link.insertId);
      client.documentTemplateId = Number(template.insertId);
      const childPii = encryptIntakePayload({ fullName: client.name, contactPhone: fakePhone });
      await db.execute(`INSERT INTO intake_submission_clients
        (intake_submission_id,client_id,initials,pii_encrypted,pii_iv_b64,pii_auth_tag_b64,pii_key_id)
        VALUES (?,?,?,?,?,?,?)`,
      [client.submissionId, client.id, initials, childPii.ciphertext, childPii.ivB64, childPii.authTagB64, childPii.keyId]);
      const guardianProfile = encryptGuardianIntake(JSON.stringify(intakeData.guardian));
      await db.execute(`INSERT INTO client_guardian_intake_profiles
        (client_id,profile_encrypted,encryption_iv_b64,encryption_auth_tag_b64,encryption_key_id,source)
        VALUES (?,?,?,?,?,'guardian_demo_enrollment')`,
      [client.id, guardianProfile.ciphertextB64, guardianProfile.ivB64, guardianProfile.authTagB64, guardianProfile.keyId]);
      const coverage = insuranceForDemoChild(client);
      client.insuranceProfileId = Number(await deps.GuardianInsuranceProfile.upsert({
        guardianUserId: guardianId, clientId: client.id, agencyId: client.agencyId,
        intakeSubmissionId: client.submissionId, ...coverage, coverageScope: 'client', confirmed: true,
        notes: 'FICTIONAL DEMO policy; commercial insurance card remains missing; Medicaid card is never requested.',
        primaryCardFrontUrl: null, primaryCardBackUrl: null, secondaryCardFrontUrl: null, secondaryCardBackUrl: null
      }, db));
      await deps.writeClientInsurance({
        clientId: client.id, agencyId: client.agencyId, ...coverage, profileId: client.insuranceProfileId,
        confirmedBy: guardianId, verifiedForClaims: false, patient: {
          firstName: client.firstName, lastName: 'Bennett — DEMO', dateOfBirth: client.dob,
          sex: 'U', addressLine1: address.street, city: address.city, state: address.state, postalCode: address.postalCode
        }
      }, db);
      for (const preferenceGuardianId of [0, guardianId]) {
        await db.execute(`INSERT INTO client_session_notification_preferences
          (agency_id,client_id,guardian_user_id,channels_json,optional_reminders_enabled,
           confirmation_requests_enabled,provider_pushed_updates_enabled,scheduling_changes_enabled)
          VALUES (?,?,?,?,1,1,1,1)`,
        [client.agencyId, client.id, preferenceGuardianId, JSON.stringify({ in_app: true, email: true, sms: false, phone: false })]);
      }
      const packet = await samplePacket(client, agency, now);
      const saved = await deps.StorageService.saveIntakeBundle({
        submissionId: client.submissionId, fileBuffer: packet, filename: `${fixture.run}-${client.firstName.toLowerCase()}-demo-packet.pdf`
      });
      created.storagePaths.push(saved.relativePath);
      const packetHash = hash(packet);
      await db.execute('UPDATE intake_submissions SET combined_pdf_path=?,combined_pdf_hash=? WHERE id=?', [saved.relativePath, packetHash, client.submissionId]);
      await db.execute('UPDATE intake_submission_clients SET bundle_pdf_path=?,bundle_pdf_hash=? WHERE intake_submission_id=? AND client_id=?',
        [saved.relativePath, packetHash, client.submissionId, client.id]);
      const [document] = await db.execute(`INSERT INTO intake_submission_documents
        (intake_submission_id,document_template_id,client_id,signed_pdf_path,pdf_hash,signed_at,audit_trail)
        VALUES (?,?,?,?,?,?,?)`,
      [client.submissionId, template.insertId, client.id, saved.relativePath, packetHash, timestamp(now),
        JSON.stringify({ fictionalDemo: true, fixtureRun: fixture.run, notRealConsent: true, actorUserId: actor.id })]);
      client.documentId = Number(document.insertId);
      created.clients.push(client);
      journal(created);
    }
    const clinical = await (deps.seedClinical || seedGuardianExperienceClinical)({
      db, clinicalDb, actorId: actor.id, guardianId, clients: created.clients, run: fixture.run,
      guardianPlanRevision: deps.guardianPlanRevision, now
    });
    // Clinical fixture defaults disable all external channels. The explicitly
    // requested demo email experience is enabled after those defaults; automatic
    // appointment recipients remain disabled to prevent duplicate mail.
    for (const client of created.clients) {
      await db.execute('UPDATE clients SET session_email_opt_in=1 WHERE id=? AND agency_id=? AND is_demo=1', [client.id, client.agencyId]);
      const details = clinical.find(item => Number(item.clientId) === client.id);
      Object.assign(client, details);
      await db.execute(`UPDATE client_agency_assignments
        SET default_office_location_id=?,default_place_of_service=?,default_service_location_id=?
        WHERE client_id=? AND agency_id=?`,
      [details.officeLocationId, client.setting === 'school' ? '03' : '11', details.serviceLocationId, client.id, client.agencyId]);
    }
    created.appointments = clinical.flatMap(child => child.appointments.map(appointment => ({
      ...appointment, clientId: child.clientId, agencyId: child.agencyId, setting: child.setting
    })));
    created.finances = await (deps.seedFinancial || seedGuardianExperienceFinancial)({
      db, actorId: actor.id, guardianId, clients: created.clients, run: fixture.run, now,
      billingTerms: deps.billingTerms, billingTermsVersion: deps.billingTermsVersion
    });
    for (const client of created.clients) client.financial = created.finances.clients.find(item => item.clientId === client.id) || null;
    created.status = 'ready_to_commit';
    journal(created);
    await clinicalDb.commit();
    created.clinicalCommitted = true;
    journal(created);
    await db.commit();
    created.mainCommitted = true;
    created.status = 'complete';
    journal(created);
    return created;
  } catch (error) {
    await Promise.allSettled([db.rollback(), clinicalDb.rollback()]);
    created.status = created.mainCommitted || created.clinicalCommitted ? 'partial_commit_needs_review' : 'rolled_back';
    created.errorCode = error.code || 'FIXTURE_SETUP_FAILED';
    if (!created.mainCommitted && !created.clinicalCommitted) {
      created.storageCleanup = await Promise.all(created.storagePaths.map(async key => {
        try { await deps.StorageService.deleteObject(key); return { key, deleted: true }; }
        catch { return { key, deleted: false }; }
      }));
    }
    journal(created);
    throw error;
  } finally {
    if (lockHeld) await db.execute('SELECT RELEASE_LOCK(?)', [`guardian-experience:${fixture.run}`]);
  }
}

function connectionOptions(clinical = false) {
  const prefix = clinical ? 'CLINICAL_DB_' : 'DB_';
  const host = process.env[`${prefix}HOST`] || process.env.DB_HOST || '127.0.0.1';
  return {
    ...(host.startsWith('/') ? { socketPath: host } : { host, port: Number(process.env[`${prefix}PORT`] || process.env.DB_PORT || 3307) }),
    user: process.env[`${prefix}USER`] || process.env.DB_USER,
    password: process.env[`${prefix}PASSWORD`] || process.env.DB_PASSWORD,
    database: process.env[`${prefix}NAME`] || process.env.DB_NAME,
    timezone: '+00:00', charset: 'utf8mb4_unicode_ci'
  };
}

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply to provision the fictional Bennett family.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  dotenv.config({ path: process.env.GUARDIAN_TEST_ENV_FILE || path.join(root, 'backend/.env'), quiet: true });
  process.env.SKIP_DB_CONNECT = '1';
  const output = process.env.GUARDIAN_TEST_OUTPUT;
  const password = process.env.GUARDIAN_TEST_PASSWORD;
  if (!output || !path.isAbsolute(output)) throw new Error('Set GUARDIAN_TEST_OUTPUT to a private absolute path outside the repository.');
  const resolved = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) throw new Error('Private output must be outside the repository.');
  if (!password || password.length < 8 || Buffer.byteLength(password) > 72) throw new Error('Set GUARDIAN_TEST_PASSWORD to an 8-72 byte temporary password.');
  // Exclusive file creation protects existing links and proves output is writable before any records are created.
  const fd = fs.openSync(resolved, 'wx', 0o600);
  const journal = value => {
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, JSON.stringify(value, null, 2), 0, 'utf8');
    fs.fsyncSync(fd);
  };
  journal({ run: fixture.run, status: 'connecting' });
  let db, clinicalDb;
  try {
    const [
      { default: GuardianInsuranceProfile }, { writeClientInsurance },
      { default: StorageService }, { guardianPlanRevision }, { intakeCommunicationDisclosure },
      { BILLING_TERMS: billingTerms, BILLING_TERMS_VERSION: billingTermsVersion }
    ] = await Promise.all([
      import('../models/GuardianInsuranceProfile.model.js'), import('../services/clientInsurance.service.js'),
      import('../services/storage.service.js'), import('../services/guardianPlanProgress.service.js'),
      import('../services/intakeCommunicationChoices.service.js'), import('../services/familyBillingPolicy.service.js')
    ]);
    db = await mysql.createConnection(connectionOptions());
    clinicalDb = await mysql.createConnection(connectionOptions(true));
    await db.execute("SET time_zone='+00:00'");
    await clinicalDb.execute("SET time_zone='+00:00'");
    const result = await provisionGuardianExperience({
      db, clinicalDb, password,
      deps: { GuardianInsuranceProfile, writeClientInsurance, StorageService, guardianPlanRevision, intakeCommunicationDisclosure,
        billingTerms, billingTermsVersion },
      journal
    });
    console.log(JSON.stringify({
      created: true, guardianId: result.guardian.id, clientIds: result.clients.map(client => client.id),
      appointments: result.appointments.length, treatmentPlans: result.clients.length,
      totalDueCents: result.finances.totalDueCents, expiresAt: result.expiresAt, privateOutput: resolved,
      emailsSent: 0, processorCalls: 0
    }));
  } finally {
    fs.closeSync(fd);
    await Promise.allSettled([db?.end(), clinicalDb?.end()]);
    const [{ default: pool }, { default: clinicalPool }] = await Promise.all([
      import('../config/database.js'), import('../config/clinicalDatabase.js')
    ]);
    await Promise.allSettled([pool.end(), clinicalPool.end()]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // mysql error.sql can contain credentials or encrypted payloads. Never log it.
    console.error('Guardian experience fixture failed:', error.code || error.message);
    process.exitCode = 1;
  });
}
