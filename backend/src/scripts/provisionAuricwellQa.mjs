// Explicit, isolated QA identities. No clients, messages, payments, or schedules.
// Run without --apply to inspect the plan. Existing identities are never reset.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { initialSettings } from '../services/auricwell/policy.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../services/familyBillingEncryption.service.js';

export const qaPlan = Object.freeze({
  agencySlug: 'auricwell-qa-demo', agencyName: 'AuricWell QA Mental Health — DEMO',
  schoolSlug: 'auricwell-qa-demo-school', schoolName: 'Cedar Grove K-8 — DEMO',
  emailInbox: 'testing@itsco.health', providerPhone: '+16189107000',
  timezone: 'America/Denver', startLocal: '05:00', deleteClients: false,
  accounts: [
    { key: 'provider', name: 'Avery Morgan QA', role: 'provider', permissions: ['clinical', 'schedule'] },
    { key: 'support', name: 'Jordan Ellis QA Support', role: 'support', permissions: ['schedule', 'records_manager'] },
    { key: 'setup', name: 'Casey Lane QA Setup', role: 'admin', permissions: ['admin', 'clinical', 'schedule', 'supervise', 'agreements', 'records_manager'] }
  ]
});

export async function provision(db, credentialsPath) {
  const result = {
    status: 'preparing', createdAt: new Date().toISOString(), ...qaPlan,
    dailyScheduleEnabled: false, outboundVerified: false,
    fullPlatformLogin: 'https://app.itsco.health/auricwell-qa-demo/login',
    auricwellLogin: 'https://auricwell.com/app', accounts: []
  };
  // Verify the existing deployment's encryption key before any writes.
  const [[probe]] = await db.execute('SELECT id,profile FROM auricwell_accounts LIMIT 1');
  if (!probe) throw new Error('No existing AuricWell encryption context is available for verification.');
  decryptFamilyBilling(probe.profile, `auricwell:account:${probe.id}`);
  const [orgs] = await db.execute('SELECT id FROM agencies WHERE slug IN (?,?)', [qaPlan.agencySlug, qaPlan.schoolSlug]);
  const emails = qaPlan.accounts.map(a => `qa.${a.key}.auricwell@example.com`);
  const [users] = await db.execute('SELECT id FROM users WHERE email IN (?,?,?)', emails);
  const [accounts] = await db.execute('SELECT id FROM auricwell_accounts WHERE username IN (?,?,?)', qaPlan.accounts.map(a => `qa.${a.key}.auricwell`));
  if (orgs.length || users.length || accounts.length) throw new Error('QA identities already exist or collide. Inspect the original credential receipt; never reset automatically.');
  const fd = fs.openSync(credentialsPath, 'wx', 0o600);
  const save = () => { fs.ftruncateSync(fd, 0); fs.writeSync(fd, JSON.stringify(result, null, 2) + '\n', 0, 'utf8'); fs.fsyncSync(fd); };
  let committed = false;
  try {
    await db.beginTransaction();
    const flags = JSON.stringify({ qaSandbox: { version: 1, syntheticOnly: true, inbox: qaPlan.emailInbox, dailyRunEnabled: false } });
    const [agency] = await db.execute(`INSERT INTO agencies (name,official_name,slug,portal_url,organization_type,is_active,feature_flags)
      VALUES (?,?,?,?,'agency',1,?)`, [qaPlan.agencyName, qaPlan.agencyName, qaPlan.agencySlug, qaPlan.agencySlug, flags]);
    result.agencyId = Number(agency.insertId);
    const [school] = await db.execute(`INSERT INTO agencies (name,official_name,slug,portal_url,organization_type,is_active,feature_flags)
      VALUES (?,?,?,?,'school',1,?)`, [qaPlan.schoolName, qaPlan.schoolName, qaPlan.schoolSlug, qaPlan.schoolSlug, flags]);
    result.schoolId = Number(school.insertId);
    await db.execute('INSERT INTO agency_business_types (agency_id,business_type,is_enabled,sort_order) VALUES (?,\'mental_health\',1,0)', [result.agencyId]);
    await db.execute('INSERT INTO agency_schools (agency_id,school_organization_id,is_active) VALUES (?,?,1)', [result.agencyId, result.schoolId]);
    await db.execute('INSERT INTO organization_affiliations (agency_id,organization_id,is_active) VALUES (?,?,1)', [result.agencyId, result.schoolId]);
    const practiceId = crypto.randomUUID();
    result.practiceId = practiceId;
    const settings = { ...initialSettings(), qaSandbox: { syntheticOnly: true, agencySlug: qaPlan.agencySlug },
      practice: { displayName: qaPlan.agencyName }, locations: ['Cedar Grove School — DEMO', 'Cedar Grove Counseling Office — DEMO'],
      services: [{ code: '90791', name: 'QA intake assessment', active: true, feeCents: 0 }, { code: '90834', name: 'QA individual counseling', active: true, feeCents: 0 }] };
    // Normal onboarding gates stay in force; no fabricated legal or vendor approvals.
    await db.execute('INSERT INTO auricwell_practices (id,agency_id,slug,name,settings) VALUES (?,?,?,?,?)',
      [practiceId, result.agencyId, qaPlan.agencySlug, qaPlan.agencyName, encryptFamilyBilling(settings, `auricwell:practice:${practiceId}`)]);
    for (const definition of qaPlan.accounts) {
      const email = `qa.${definition.key}.auricwell@example.com`, username = `qa.${definition.key}.auricwell`;
      const platformPassword = crypto.randomBytes(24).toString('base64url');
      const auricwellPassword = crypto.randomBytes(24).toString('base64url');
      const [user] = await db.execute(`INSERT INTO users
        (email,personal_email,username,first_name,last_name,role,status,is_active,is_demo,created_via_dev_fill,password_hash,identity_product,timezone,phone_number,personal_phone,languages_spoken,sees_clients,provider_accepting_new_clients)
        VALUES (?,?,?,?,?,?,'ACTIVE_EMPLOYEE',1,1,1,?,'full_suite',?,?,?,?,?,?)`,
      [email,email,email,definition.name.split(' ')[0],definition.name.split(' ').slice(1).join(' '),definition.role,
        await bcrypt.hash(platformPassword,12),qaPlan.timezone,
        definition.key==='provider'?qaPlan.providerPhone:null,definition.key==='provider'?qaPlan.providerPhone:null,
        definition.key==='provider'?'English, Spanish':null,definition.key==='provider'?1:0,definition.key==='provider'?1:0]);
      const userId = Number(user.insertId), accountId = crypto.randomUUID();
      await db.execute('INSERT INTO user_agencies (user_id,agency_id,is_active,is_default,agency_role) VALUES (?,?,1,1,?)', [userId,result.agencyId,definition.role]);
      await db.execute('INSERT INTO user_preferences (user_id,sms_enabled,sms_forwarding_enabled,sms_support_mirror_enabled) VALUES (?,0,0,0)',[userId]);
      await db.execute('INSERT INTO auricwell_accounts (id,username,password_hash,profile,status,canonical_user_id) VALUES (?,?,?,?,\'active\',?)',
        [accountId,username,await bcrypt.hash(auricwellPassword,12),encryptFamilyBilling({name:definition.name,email,operator:false},`auricwell:account:${accountId}`),userId]);
      await db.execute('INSERT INTO auricwell_memberships (practice_id,account_id,permissions,patient_ids,billing_patient_ids,actor_type,status) VALUES (?,?,?,\'[]\',\'[]\',\'staff\',\'active\')',
        [practiceId,accountId,JSON.stringify(definition.permissions)]);
      result.accounts.push({key:definition.key,userId,accountId,email,platformUsername:email,platformPassword,auricwellUsername:username,auricwellPassword,auricwellMfa:'Enroll through the normal sign-in flow; store the seed privately.'});
    }
    result.status = 'prepared_pending_commit'; save();
    await db.commit(); committed = true;
    result.status = 'accounts_created_setup_required'; save();
    return result;
  } catch (error) {
    if (!committed) await db.rollback();
    result.status = committed ? 'committed_receipt_write_failed' : 'rolled_back';
    try { save(); } catch { /* Preserve original error; never print credential values. */ }
    throw error;
  } finally { fs.closeSync(fd); }
}

async function main() {
  const root = fileURLToPath(new URL('../../..',import.meta.url));
  dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({plan:qaPlan,createsClients:false,sendsMessages:false,dailyScheduleEnabled:false},null,2)); return; }
  const directory = path.join(root,'secrets','auricwell-qa');
  fs.mkdirSync(directory,{recursive:true,mode:0o700}); fs.chmodSync(directory,0o700);
  const credentialsPath=path.join(directory,'credentials.json');
  const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:10000,charset:'utf8mb4_unicode_ci'});
  try {
    const r=await provision(db,credentialsPath);
    console.log(JSON.stringify({status:r.status,agencyId:r.agencyId,schoolId:r.schoolId,practiceId:r.practiceId,credentialsPath,accounts:r.accounts.map(a=>({key:a.key,userId:a.userId,email:a.email})),dailyScheduleEnabled:false}));
  } finally { await db.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error('QA provisioning failed:',error.code||error.message);process.exitCode=1;});
