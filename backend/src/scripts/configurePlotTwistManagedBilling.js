// Authorized October 14, 2026 configuration. Dry-run by default.
// Uses existing DB_* configuration; never transmits claims or deletes care records.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import { appendSecurityEvidence } from '../services/securityEvidence.service.js';

const apply = process.argv.includes('--apply');
const actorId = Number(process.argv.find(a=>a.startsWith('--actor-user-id='))?.split('=')[1]);
const managedSlugs = ['itsco','nlu','tisi','sstc','mh4kidz','latinx-therapist-project-co'];
const closedSlugs = ['burningsage','d11-summer-burningsage'];
const db = await pool.getConnection();
try {
  const slugs = ['plottwistco',...managedSlugs,...closedSlugs];
  const [organizations] = await db.execute(`SELECT id,name,slug,is_active,is_archived,organization_type FROM agencies WHERE slug IN (${slugs.map(()=>'?').join(',')})`,slugs);
  if (organizations.length !== slugs.length) throw new Error('Expected organization identities are missing or ambiguous; review before applying.');
  const find = slug=>organizations.find(a=>a.slug===slug);
  const manager = find('plottwistco'), managed = managedSlugs.map(find), closed = closedSlugs.map(find);
  if ([manager,...managed].some(a=>a.organization_type!=='agency'||!a.is_active||a.is_archived)) throw new Error('Manager and managed companies must be active agencies.');
  const closedIds = closed.map(a=>a.id), marks=closedIds.map(()=>'?').join(',');
  const [shared] = await db.execute('SELECT agency_id FROM organization_affiliations WHERE organization_id=? AND agency_id<>? AND is_active=1',[find('d11-summer-burningsage').id,find('burningsage').id]);
  if (shared.length) throw new Error('Burning Sage program has another active parent; review its archive scope.');
  const [actors] = await db.execute("SELECT id,email,role FROM users WHERE id=? AND role='super_admin' AND is_active=1 AND COALESCE(is_archived,0)=0",[actorId||0]);
  if (apply && !actors[0]) throw new Error('An active authorizing superadmin --actor-user-id is required.');
  const summary = {apply,manager:{id:manager.id,name:manager.name},managed:managed.map(a=>({id:a.id,name:a.name})),archive:closed.map(a=>({id:a.id,name:a.name})),grantRule:'Active PlotTwistCo membership with explicit Billing Access; individual permissions are not changed.'};
  if (!apply) { console.log(JSON.stringify(summary)); }
  else {
    await db.query(await fs.readFile(new URL('../../../database/migrations/1625_managed_medical_billing.sql',import.meta.url),'utf8'));
    await db.beginTransaction();
    // Keep a permission-only before image in immutable evidence for review/recovery.
    const before={};
    const snapshots={
      agencies:[`SELECT id,slug,is_active,is_archived,archived_at,archived_by_user_id FROM agencies WHERE id IN (${marks}) FOR UPDATE`,closedIds],
      memberships:[`SELECT user_id,agency_id,is_active FROM user_agencies WHERE agency_id IN (${marks}) FOR UPDATE`,closedIds],
      affiliations:[`SELECT id,is_active FROM organization_affiliations WHERE agency_id IN (${marks}) OR organization_id IN (${marks}) FOR UPDATE`,[...closedIds,...closedIds]],
      domains:[`SELECT id,is_active FROM agency_custom_domains WHERE agency_id IN (${marks}) FOR UPDATE`,closedIds],
      intakeLinks:[`SELECT id,is_active FROM intake_links WHERE organization_id IN (${marks}) FOR UPDATE`,closedIds],
      management:['SELECT * FROM agency_billing_management WHERE manager_agency_id=? OR agency_id IN ('+managed.map(()=>'?').join(',')+') FOR UPDATE',[manager.id,...managed.map(a=>a.id)]]
    };
    for (const [name,[sql,args]] of Object.entries(snapshots)) [before[name]]=await db.execute(sql,args);
    if(before.management.some(row=>managed.some(a=>a.id===row.agency_id)&&row.manager_agency_id!==manager.id&&row.is_active)) throw new Error('A managed company already has another billing manager.');
    for (const agency of managed) await db.execute(`INSERT INTO agency_billing_management(agency_id,manager_agency_id,created_by_user_id) VALUES(?,?,?)
      ON DUPLICATE KEY UPDATE manager_agency_id=VALUES(manager_agency_id),is_active=1`,[agency.id,manager.id,actorId]);
    await db.execute(`UPDATE agency_billing_management SET is_active=0 WHERE agency_id IN (${marks}) OR manager_agency_id IN (${marks})`,[...closedIds,...closedIds]);
    await db.execute(`UPDATE agencies SET is_active=0,is_archived=1,archived_at=COALESCE(archived_at,NOW()),archived_by_user_id=COALESCE(archived_by_user_id,?) WHERE id IN (${marks})`,[actorId,...closedIds]);
    await db.execute(`UPDATE user_agencies SET is_active=0 WHERE agency_id IN (${marks})`,closedIds);
    await db.execute(`UPDATE organization_affiliations SET is_active=0 WHERE agency_id IN (${marks}) OR organization_id IN (${marks})`,[...closedIds,...closedIds]);
    await db.execute(`UPDATE agency_custom_domains SET is_active=0 WHERE agency_id IN (${marks})`,closedIds);
    await db.execute(`UPDATE intake_links SET is_active=0 WHERE organization_id IN (${marks})`,closedIds);
    await db.execute(`UPDATE appointment_reminders SET status='canceled',skip_reason='agency_archived' WHERE agency_id IN (${marks}) AND status='pending'`,closedIds);
    await db.execute(`UPDATE agency_eligibility_automation SET enabled=0 WHERE agency_id IN (${marks})`,closedIds);
    await appendSecurityEvidence({requestId:crypto.randomUUID(),phase:'maintenance',userId:actorId,email:actors[0].email,role:actors[0].role,
      method:'CLI',route:'maintenance/plot-twist-managed-billing',clientIp:null,ipSource:'authorized_maintenance',peerIp:null,
      action:'managed_billing_configured_and_agency_archived',outcome:'success',statusCode:200,
      details:{...summary,reason:'Owner requested managed billing for current companies and closure archive of Burning Sage.',before}},db);
    await db.commit();
    console.log(JSON.stringify({...summary,committed:true}));
  }
} catch(error) { await db.rollback(); throw error; }
finally { db.release(); await pool.end(); }
