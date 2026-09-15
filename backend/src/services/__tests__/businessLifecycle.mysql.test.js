import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { createBusinessLifecycleService } from '../businessLifecycle.service.js';

// This suite creates its own database on an explicitly supplied disposable local server.
test('business lifecycle persistence and billing transactions', { skip: !process.env.PTCO_TEST_MYSQL_PORT }, async t => {
  const config = { host: '127.0.0.1', port: Number(process.env.PTCO_TEST_MYSQL_PORT), user: 'root', password: process.env.PTCO_TEST_MYSQL_PASSWORD, multipleStatements: true };
  const dbName = `ptco_lifecycle_test_${crypto.randomBytes(6).toString('hex')}`;
  const root = await mysql.createConnection(config); let pool;
  const actor = { id: 1, role: 'super_admin' }, admin = { id: 2, role: 'admin' };
  try {
    await root.query(`CREATE DATABASE ${dbName}`);
    pool = mysql.createPool({ ...config, database: dbName, connectionLimit: 5 });
    await pool.query(`CREATE TABLE users (id INT PRIMARY KEY); INSERT INTO users VALUES (1),(2);
      CREATE TABLE agencies (id INT PRIMARY KEY, organization_type VARCHAR(40)); INSERT INTO agencies VALUES (1,'agency'),(2,'consultant'),(3,'school');
      CREATE TABLE business_onboarding_requests (id CHAR(36) PRIMARY KEY,agency_id INT,status VARCHAR(30));
      CREATE TABLE agency_billing_invoices (id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,period_start DATE,billing_domain VARCHAR(40) DEFAULT 'agency_subscription');`);
    const migration = await readFile(new URL('../../../../database/migrations/1453_business_lifecycle.sql', import.meta.url), 'utf8');
    await pool.query(migration); await pool.query(migration);
    const service = createBusinessLifecycleService(pool), scope = { agencyId: 1 };
    await t.test('default state is read-only, saves persist, and company records stay isolated', async () => {
      const record = await service.get(scope); assert.equal(record.revision, 0);
      assert.equal((await pool.query('SELECT COUNT(*) n FROM business_lifecycles'))[0][0].n, 0);
      record.state.stages.interview.notes = 'Synthetic discovery outcomes'; record.state.stages.interview.completed = ['discovery'];
      const saved = await service.save(scope, record, actor); assert.equal(saved.revision, 1);
      assert.equal((await service.get(scope)).state.stages.interview.notes, 'Synthetic discovery outcomes');
      assert.equal((await service.get({ agencyId: 2 })).state.stages.interview.notes, '');
      await assert.rejects(service.get({ agencyId: 3 }), e => e.status === 400);
      await assert.rejects(service.get({ agencyId: 999 }), e => e.status === 404);
    });
    await t.test('concurrent saves cannot overwrite each other and each revision has one audit entry', async () => {
      const record = await service.get(scope);
      const results = await Promise.allSettled([service.save(scope, record, actor), service.save(scope, record, actor)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
      assert.equal((await pool.query('SELECT COUNT(*) n FROM business_lifecycle_events'))[0][0].n, 2);
    });
    await t.test('company admins can confirm tasks but cannot write management pricing or revenue', async () => {
      const record = await service.get(scope); record.state.stages.setup.owner = 'Company owner';
      await service.save(scope, record, admin);
      const forged = await service.get(scope); forged.state.revenue = [{ month: '2026-09', amountCents: 0, reference: 'Forged confirmation', confirmed: true }];
      await assert.rejects(service.save(scope, forged, admin), e => e.status === 403);
      assert.equal((await service.get(scope)).revision, 3);
    });
    await t.test('invoiced terms and revenue freeze; future versions and later termination remain editable', async () => {
      const record = await service.get(scope);
      record.state.agreements = [{ startMonth: '2026-09', endMonth: '', status: 'active', contractReference: 'Signed agreement 1', signedOn: '2026-09-01', revenueBasis: 'Monthly collections', mode: 'higher_of', revenueShareBps: 1000, thresholdCents: 0, services: [] }];
      record.state.revenue = [{ month: '2026-09', amountCents: 2000000, reference: 'Reconciled report', confirmed: true }];
      await service.save(scope, record, actor);
      const companyUpdate = await service.get(scope); companyUpdate.state.stages.setup.notes = 'Admin progress after signed terms';
      await service.save(scope, companyUpdate, admin);
      await pool.execute("INSERT INTO agency_billing_invoices (agency_id,period_start) VALUES (1,'2026-09-01')");
      for (const change of [s => s.agreements[0].revenueShareBps = 1, s => s.revenue[0].amountCents = 0, s => s.agreements = []]) {
        const changed = await service.get(scope); change(changed.state);
        await assert.rejects(service.save(scope, changed, actor), e => e.status === 409 && /invoice already exists/.test(e.message));
      }
      const future = await service.get(scope);
      future.state.agreements[0].endMonth = '2026-09'; // Final service month may be set after its invoice.
      future.state.agreements.push({ ...future.state.agreements[0], startMonth: '2026-11', endMonth: '', revenueShareBps: 1500, contractReference: 'Renewed agreement' });
      await service.save(scope, future, actor);
    });
    await t.test('invoice creation rejects an obsolete financial snapshot', async () => {
      const record = await service.get(scope), oldState = structuredClone(record.state);
      record.state.revenue.push({ month: '2026-11', amountCents: 3000000, reference: 'Report', confirmed: true });
      await service.save(scope, record, actor);
      let created = false;
      await assert.rejects(service.withBillingLock(1, oldState, async () => { created = true; }), e => e.status === 409);
      assert.equal(created, false);
    });
    await t.test('the invoice lock serializes concurrent generators and blocks retroactive edits', async () => {
      const state = await service.billingState(1);
      const generate = () => service.withBillingLock(1, state, async db => {
        const [[existing]] = await db.execute("SELECT id FROM agency_billing_invoices WHERE agency_id=1 AND period_start='2026-11-01'");
        if (existing) return existing.id;
        const [r] = await db.execute("INSERT INTO agency_billing_invoices (agency_id,period_start) VALUES (1,'2026-11-01')"); return r.insertId;
      });
      const ids = await Promise.all([generate(), generate()]); assert.equal(ids[0], ids[1]);
      const record = await service.get(scope); record.state.revenue.find(r => r.month === '2026-11').amountCents = 0;
      await assert.rejects(service.save(scope, record, actor), e => e.status === 409);
    });
    await t.test('audit write failure rolls back the entire change', async () => {
      const record = await service.get(scope); record.state.stages.management.notes = 'Must roll back';
      await pool.query("CREATE TRIGGER reject_lifecycle_audit BEFORE INSERT ON business_lifecycle_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'");
      try { await assert.rejects(service.save(scope, record, actor)); } finally { await pool.query('DROP TRIGGER reject_lifecycle_audit'); }
      assert.notEqual((await service.get(scope)).state.stages.management.notes, 'Must roll back');
    });
    await t.test('activated and declined enquiry records cannot be mutated through the enquiry URL', async () => {
      const id = crypto.randomUUID();
      await pool.execute("INSERT INTO business_onboarding_requests VALUES (?,NULL,'submitted')", [id]);
      const record = await service.get({ requestId: id }); await service.save({ requestId: id }, record, actor);
      for (const status of ['activated', 'declined']) {
        await pool.execute('UPDATE business_onboarding_requests SET status=? WHERE id=?', [status, id]);
        await assert.rejects(service.save({ requestId: id }, await service.get({ requestId: id }), actor), e => e.status === 409);
      }
    });
  } finally { await pool?.end(); await root.query(`DROP DATABASE IF EXISTS ${dbName}`); await root.end(); }
});
