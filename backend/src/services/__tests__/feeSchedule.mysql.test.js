import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: vi.fn() }));
import { getCanonicalFeeSchedule, saveCanonicalFeeSchedule, adoptPlatformFeeDefaults, resolveCanonicalFeeQuote } from '../feeSchedule.service.js';
import { credentialPayerRows } from '../credentialPayerEligibility.service.js';

const socket = process.env.FEE_MYSQL_SOCKET;
const enabled = Boolean(socket) || process.env.FEE_SCHEDULE_MYSQL_TEST === '1';
const connection = socket ? { socketPath: socket, user: 'root' } : { host: '127.0.0.1', port: 33317, user: 'root', password: 'synthetic-root-only' };
const suite = enabled ? describe : describe.skip;
suite('canonical fee schedule against isolated MySQL', () => {
  let admin, db, d;
  const actor = { id: 501, role: 'super_admin' };
  beforeAll(async () => {
    if (socket && !/^\/private\/tmp\/pt-billing-fees-(?:h0002-)?mysql-20261103\//.test(socket)) throw new Error('Only the owned socket-only synthetic MySQL instance may run this test');
    admin = await mysql.createConnection(connection);
    await admin.query('DROP DATABASE IF EXISTS fee_schedule_qa');
    await admin.query('CREATE DATABASE fee_schedule_qa');
    db = mysql.createPool({ ...connection, database: 'fee_schedule_qa', connectionLimit: 8 });
    for (const sql of [
      'CREATE TABLE agencies (id INT PRIMARY KEY,feature_flags JSON)',
      'CREATE TABLE agency_medical_service_codes (id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,service_code VARCHAR(32),description VARCHAR(100),unit_calc_mode VARCHAR(32),unit_minutes INT,is_addon TINYINT,is_active TINYINT,min_minutes INT,max_minutes INT,max_units_per_session INT,max_units_per_day INT,default_place_of_service CHAR(2),allowed_credential_tiers_json JSON,session_mode VARCHAR(20),created_by_user_id INT,UNIQUE(agency_id,service_code))',
      'CREATE TABLE users (id INT PRIMARY KEY,first_name VARCHAR(40),last_name VARCHAR(40),credential VARCHAR(80),title VARCHAR(50),role VARCHAR(30),is_hourly_worker TINYINT,is_active TINYINT,is_archived TINYINT,status VARCHAR(30))',
      'CREATE TABLE user_agencies (user_id INT,agency_id INT,is_active TINYINT)',
      'CREATE TABLE insurance_credentialing_definitions (id INT PRIMARY KEY,agency_id INT,name VARCHAR(80),logo_path VARCHAR(100),parent_id INT,sort_order INT)',
      'CREATE TABLE user_insurance_credentialing (id INT PRIMARY KEY,user_id INT,insurance_credentialing_definition_id INT,effective_date DATE)',
      'CREATE TABLE credentialing_workflow_tracking (agency_id INT,subject_type VARCHAR(20),credential_id INT,status VARCHAR(20),revalidation_due DATE)',
      'CREATE TABLE credentialing_payer_links (agency_id INT,insurance_definition_id INT,payer_id VARCHAR(32))',
      'CREATE TABLE medical_payer_setup_requests (id INT PRIMARY KEY,agency_id INT,payer_name VARCHAR(120))',
      'CREATE TABLE medical_payer_setup_details (request_id INT,claimmd_payer_id VARCHAR(32),directory_name VARCHAR(120),directory_status VARCHAR(30))',
      'CREATE TABLE medical_fee_schedule_items (id INT PRIMARY KEY,agency_id INT,procedure_code VARCHAR(32),payer_label VARCHAR(120),modifier VARCHAR(12),unit_price_cents INT,is_active TINYINT)',
      'CREATE TABLE tenant_services (id INT PRIMARY KEY,agency_id INT,service_code VARCHAR(32),price_cents INT,default_duration_minutes INT,is_active TINYINT)',
      'CREATE TABLE self_pay_service_rates (agency_id INT,tenant_service_id INT,provider_user_id INT,rate_cents INT,rate_unit VARCHAR(16))',
      'CREATE TABLE historical_claim_lines (id INT PRIMARY KEY,charge_cents INT)',
      'CREATE TABLE clinical_claims (id INT PRIMARY KEY,agency_id INT,clinical_session_id INT,is_deleted TINYINT)',
      'CREATE TABLE clinical_claim_lines (id INT PRIMARY KEY,clinical_claim_id INT,procedure_code VARCHAR(32))',
      'CREATE TABLE clinical_sessions (id INT PRIMARY KEY,agency_id INT,service_code VARCHAR(32))',
      `INSERT INTO agencies VALUES (2,'{"medicalBillingEnabled":true}'),(6,'{"medicalBillingEnabled":true}'),(7,'{"medicalBillingEnabled":false}'),(8,'{"medicalBillingEnabled":true}')`,
      "INSERT INTO agency_medical_service_codes (id,agency_id,service_code,description,unit_calc_mode,unit_minutes,is_addon,is_active) VALUES (1,2,'90834','Saved therapy description','SINGLE',NULL,0,1),(2,2,'H0002','Saved screening rules','SINGLE',NULL,0,1),(3,2,'CUSTOM','Inactive service','SINGLE',NULL,0,0),(4,6,'90834','Other practice','SINGLE',NULL,0,1),(5,7,'90834','Disabled billing practice','SINGLE',NULL,0,1)",
      "INSERT INTO users VALUES (8,'DEMO','Licensed','LPC','Therapist','provider',0,1,0,'ACTIVE'),(9,'DEMO','Candidate','LPCC','Therapist','provider',0,1,0,'ACTIVE'),(10,'DEMO','Other','LPC','Therapist','provider',0,1,0,'ACTIVE')",
      'INSERT INTO user_agencies VALUES (8,2,1),(9,2,1),(10,6,1)',
      "INSERT INTO insurance_credentialing_definitions VALUES (1,2,'Aetna',NULL,NULL,0),(2,6,'Other practice insurer',NULL,NULL,0)",
      "INSERT INTO user_insurance_credentialing VALUES (1,8,1,'2000-01-01'),(2,9,1,'2000-01-01'),(3,10,2,'2000-01-01')",
      "INSERT INTO credentialing_workflow_tracking VALUES (2,'provider',1,'active','2100-01-01'),(2,'provider',2,'active','2100-01-01'),(6,'provider',3,'active','2100-01-01')",
      "INSERT INTO credentialing_payer_links VALUES (2,1,'AET'),(6,2,'OTHER')",
      "INSERT INTO medical_payer_setup_requests VALUES (1,2,'Aetna'),(2,6,'Other practice insurer')",
      "INSERT INTO medical_payer_setup_details VALUES (1,'AET','Aetna directory','id_match'),(2,'OTHER','Other insurer','id_match')",
      "INSERT INTO medical_fee_schedule_items VALUES (1,2,'H0002',NULL,NULL,3500,1)",
      "INSERT INTO tenant_services VALUES (1,2,'90834',NULL,45,1),(2,2,'H0002',4000,10,1)",
      'INSERT INTO historical_claim_lines VALUES (1,7500)',
      'INSERT INTO clinical_claims VALUES (1,2,1,0),(2,2,2,0),(3,6,3,0),(4,2,4,1)',
      "INSERT INTO clinical_claim_lines VALUES (1,1,'MISSING'),(2,3,'OTHER'),(3,4,'DELETED')",
      "INSERT INTO clinical_sessions VALUES (1,2,'90834'),(2,2,'CUSTOM'),(3,6,'OTHER'),(4,2,'DELETED')"
    ]) await db.query(sql);
    const source = await readFile(new URL('../../../../database/migrations/1740_canonical_fee_schedules.sql', import.meta.url), 'utf8');
    for (const statement of splitSqlStatements(stripSqlLineComments(source))) await db.query(statement);
    const modifiers = await readFile(new URL('../../../../database/migrations/1768_fee_schedule_modifiers.sql', import.meta.url), 'utf8');
    for (const statement of splitSqlStatements(stripSqlLineComments(modifiers))) {
      if (statement.includes('billing_claim_overrides')) continue;
      await db.query(statement);
    }
    const modifiers = await readFile(new URL('../../../../database/migrations/1768_fee_schedule_modifiers.sql', import.meta.url), 'utf8');
    for (const statement of splitSqlStatements(stripSqlLineComments(modifiers))) {
      if (statement.includes('billing_claim_overrides')) continue;
      await db.query(statement);
    }
    d = { main: db, clinical: db, access: async (_user, agencyId) => agencyId === 2, credentials: credentialPayerRows };
  }, 20000);
  afterAll(async () => {
    if (db) await db.end();
    if (admin) { await admin.query('DROP DATABASE IF EXISTS fee_schedule_qa'); await admin.end(); }
  });
  it('persists scoped rates, rejects stale edits, protects history and never edits existing claims or catalog rules', async () => {
    let view = await getCanonicalFeeSchedule(actor, { agencyId: 2 }, d);
    expect(view.rows).toHaveLength(2);
    expect(view.missingServiceCodes).toEqual(['MISSING']);
    expect(view.inactiveServiceCodes).toEqual(['CUSTOM']);
    expect(view.warnings.join(' ')).toContain('Existing claims remain visible');
    expect(await resolveCanonicalFeeQuote({ agencyId: 2, serviceCode: 'MISSING' }, d)).toMatchObject({ serviceCodeAvailable: false, inactiveService: false, rateCents: null, amountCents: null });
    expect(await resolveCanonicalFeeQuote({ agencyId: 2, serviceCode: 'CUSTOM' }, d)).toMatchObject({ serviceCodeAvailable: false, inactiveService: true });
    expect(view.rows.find(r => r.serviceCode === 'H0002')).toMatchObject({ rateCents: 3500, source: 'legacy_practice', customRateCents: 3500 });
    expect(view.providers.find(p => p.id === 8).eligiblePayerIds).toEqual(['AET']);
    expect(view.providers.find(p => p.id === 9).eligiblePayerIds).toEqual([]);
    expect(view.providers.some(p => p.id === 10)).toBe(false);
    view = await adoptPlatformFeeDefaults(actor, { agencyId: 2, mode: 'insurance', revision: 0 }, d);
    expect(view.adopted).toBe(1);
    expect(view.rows.find(r => r.serviceCode === 'H0002').rateCents).toBe(3500);
    const change = async data => saveCanonicalFeeSchedule(actor, { agencyId: 2, mode: 'insurance', scope: 'practice', serviceCode: '90834', revision: view.revision, ...data }, d);
    view = await change({ rateCents: 12000 });
    await expect(saveCanonicalFeeSchedule(actor, { agencyId: 2, serviceCode: '90834', revision: 0, rateCents: 1 }, d)).rejects.toMatchObject({ status: 409 });
    view = await change({ scope: 'payer', payerId: 'AET', rateCents: 14000 });
    view = await change({ scope: 'provider', payerId: 'AET', providerUserId: 8, rateCents: 13000 });
    let quote = await resolveCanonicalFeeQuote({ agencyId: 2, serviceCode: '90834', payerId: 'AET', providerUserId: 8, units: 2 }, d);
    expect(quote).toMatchObject({ source: 'provider', amountCents: 26000, providerRateEligible: true });
    await expect(change({ scope: 'provider', payerId: 'AET', providerUserId: 9, rateCents: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(change({ scope: 'payer', payerId: 'OTHER', rateCents: 1 })).rejects.toMatchObject({ status: 409 });
    view = await change({ action: 'reset', serviceCode: 'H0002' });
    expect(view.rows.find(r => r.serviceCode === 'H0002')).toMatchObject({ rateCents: 3000, source: 'platform_starter' });
    view = await change({ action: 'set_visibility', isHidden: true });
    expect(view.rows.find(r => r.serviceCode === '90834')).toMatchObject({ isHidden: true, isActive: true });
    const [[catalog]] = await db.query("SELECT * FROM agency_medical_service_codes WHERE id=1");
    expect(catalog).toMatchObject({ description: 'Saved therapy description', unit_calc_mode: 'SINGLE', is_active: 1 });
    const [[old]] = await db.query('SELECT charge_cents FROM historical_claim_lines WHERE id=1'); expect(old.charge_cents).toBe(7500);
    await expect(db.query('UPDATE medical_fee_schedule_rates SET rate_cents=1 WHERE id=1')).rejects.toThrow('immutable');
    await expect(db.query('DELETE FROM medical_fee_schedule_rates WHERE id=1')).rejects.toThrow('cannot be deleted');
    await db.query("UPDATE credentialing_workflow_tracking SET status='denied' WHERE agency_id=2 AND credential_id=1");
    quote = await resolveCanonicalFeeQuote({ agencyId: 2, serviceCode: '90834', payerId: 'AET', providerUserId: 8 }, d);
    expect(quote).toMatchObject({ source: 'payer', rateCents: 14000, providerRateEligible: false });
    const revision = view.revision;
    const raced = await Promise.allSettled([change({ revision, serviceCode: '90834', rateCents: 17000 }), change({ revision, serviceCode: 'H0002', rateCents: 5000 })]);
    expect(raced.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(raced.find(r => r.status === 'rejected').reason).toMatchObject({ status: 409 });
    view = await getCanonicalFeeSchedule(actor, { agencyId: 2, mode: 'self_pay', scope: 'category', categoryKey: 'category_2' }, d);
    view = await saveCanonicalFeeSchedule(actor, { agencyId: 2, mode: 'self_pay', scope: 'category', categoryKey: 'category_2', serviceCode: '90834', revision: view.revision, rateCents: 9000, rateUnit: 'hour' }, d);
    quote = await resolveCanonicalFeeQuote({ agencyId: 2, mode: 'self_pay', serviceCode: '90834', providerUserId: 9, durationMinutes: 45 }, d);
    expect(quote).toMatchObject({ source: 'category', rateUnit: 'hour', rateCents: 9000, amountCents: 6750 });
  }, 20000);
  it('adds only missing H0002 to enabled existing medical catalogs and never overwrites even inactive custom screening rules', async () => {
    await db.query("UPDATE agency_medical_service_codes SET is_active=0,max_units_per_session=7,allowed_credential_tiers_json=JSON_ARRAY('saved_custom_tier') WHERE agency_id=2 AND service_code='H0002'");
    const [before] = await db.query('SELECT * FROM agency_medical_service_codes ORDER BY id');
    const source = await readFile(new URL('../../../../database/migrations/1741_h0002_medical_catalog.sql', import.meta.url), 'utf8');
    const statements = splitSqlStatements(stripSqlLineComments(source));
    for (const sql of statements) await db.query(sql);
    for (const sql of statements) await db.query(sql);
    const [after] = await db.query('SELECT * FROM agency_medical_service_codes ORDER BY id');
    expect(after.filter(row=>before.some(old=>old.id===row.id))).toEqual(before);
    const added=after.filter(row=>!before.some(old=>old.id===row.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({agency_id:6,service_code:'H0002',description:'Behavioral Health Screening',unit_calc_mode:'SINGLE',unit_minutes:null,min_minutes:null,max_minutes:null,max_units_per_session:1,max_units_per_day:null,default_place_of_service:null,created_by_user_id:null,session_mode:'individual'});
    expect(added[0].allowed_credential_tiers_json).toEqual(['intern_plus']);
    expect(await resolveCanonicalFeeQuote({agencyId:6,serviceCode:'H0002',units:1},d)).toMatchObject({serviceCodeAvailable:true,rateCents:3000,amountCents:3000,source:'platform_starter'});
  });
});
