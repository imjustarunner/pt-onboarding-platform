// All people, organizations and payment records in this fixture are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('management proposal SQL finalizes the same invoice atomically and rejects already-issued rows', { skip: !process.env.PTCO_TEST_MYSQL_PORT }, async t => {
  const port = Number(process.env.PTCO_TEST_MYSQL_PORT);
  assert.notEqual(port, 3307, 'Never run synthetic tests against the production proxy');
  // The application model imports a pool with a readiness probe. Disable that
  // probe before loading it; every operation below supplies the disposable db.
  process.env.SKIP_DB_CONNECT = '1';
  const { default: Invoice } = await import('../../models/AgencyBillingInvoice.model.js');
  const { default: applicationPool } = await import('../../config/database.js');
  const dbName = `coaching_invoice_test_${crypto.randomBytes(5).toString('hex')}`;
  const root = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: process.env.PTCO_TEST_MYSQL_PASSWORD || '' });
  let db;
  const snapshot = { businessAgreement: { contractReference: '11111111-1111-4111-8111-111111111111', requiresSignatures: true, ready: false, signedOn: '' } };
  const finalized = { merchantMode: 'agency_managed', providerConnectionId: null,
    schoolsUsed: 0, programsUsed: 0, adminsUsed: 1, activeOnboardeesUsed: 0,
    baseFeeCents: 0, extraSchoolsCents: 0, extraProgramsCents: 0, extraAdminsCents: 0, extraOnboardeesCents: 0,
    totalCents: 18000, invoiceDeliveryMode: 'manual',
    lineItemsJson: { businessAgreement: { ...snapshot.businessAgreement, ready: true, signedOn: '2026-11-05', executionEvidence: { documentId: snapshot.businessAgreement.contractReference } },
      chargeLines: [{ label: 'Managed business support', amountCents: 18000 }] } };
  try {
    await root.query(`CREATE DATABASE ${dbName}`);
    db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: process.env.PTCO_TEST_MYSQL_PASSWORD || '', database: dbName });
    await db.query(`CREATE TABLE agency_billing_invoices (
      id INT PRIMARY KEY, agency_id INT, status VARCHAR(32), payment_status VARCHAR(32),
      merchant_mode VARCHAR(40), provider_connection_id INT,
      schools_used INT, programs_used INT, admins_used INT, active_onboardees_used INT,
      base_fee_cents INT, extra_schools_cents INT, extra_programs_cents INT, extra_admins_cents INT, extra_onboardees_cents INT,
      communication_actual_cost_cents INT, communication_markup_cents INT, communication_subtotal_cents INT,
      total_cents INT, line_items_json JSON, invoice_delivery_mode VARCHAR(32), pdf_storage_path TEXT,
      error_message TEXT, updated_at DATETIME, qbo_invoice_id VARCHAR(40), qbo_bill_id VARCHAR(40), qbo_payment_id VARCHAR(40),
      payment_reference VARCHAR(80), payment_method_id INT, paid_at DATETIME, auto_charge_attempted_at DATETIME,
      invoice_sent_at DATETIME, invoice_delivery_status VARCHAR(32) DEFAULT 'not_sent'
    ) ENGINE=InnoDB`);
    await db.execute("INSERT INTO agency_billing_invoices (id,agency_id,status,payment_status,total_cents,line_items_json) VALUES (7,7001,'draft','unpaid',18000,?)", [JSON.stringify(snapshot)]);
    await t.test('same ID and original proposal survive a transaction rollback', async () => {
      await db.beginTransaction();
      const saved = await Invoice.finalizeManagementProposal(7, 7001, finalized, db);
      assert.equal(saved.id, 7); assert.equal(saved.total_cents, 18000);
      assert.equal(saved.line_items_json.businessAgreement.ready, true);
      assert.equal(saved.line_items_json.businessAgreement.signedOn, '2026-11-05');
      await db.rollback();
      assert.equal((await Invoice.findById(7, db)).line_items_json.businessAgreement.ready, false);
    });
    await t.test('a concurrently issued invoice and wrong tenant cannot be replaced', async () => {
      await db.execute("UPDATE agency_billing_invoices SET qbo_invoice_id='synthetic-issued' WHERE id=7");
      await assert.rejects(Invoice.finalizeManagementProposal(7, 7001, finalized, db), error => error.status === 409);
      await db.execute('UPDATE agency_billing_invoices SET qbo_invoice_id=NULL WHERE id=7');
      await assert.rejects(Invoice.finalizeManagementProposal(7, 999, finalized, db), error => error.status === 409);
    });
    await t.test('committed finalization is permanent and cannot finalize twice', async () => {
      await db.beginTransaction();
      await Invoice.finalizeManagementProposal(7, 7001, finalized, db);
      await db.commit();
      const saved = await Invoice.findById(7, db);
      assert.equal(saved.line_items_json.chargeLines[0].amountCents, 18000);
      await assert.rejects(Invoice.finalizeManagementProposal(7, 7001, finalized, db), error => error.status === 409);
      assert.equal((await db.query('SELECT COUNT(*) n FROM agency_billing_invoices'))[0][0].n, 1);
    });
  } finally {
    await db?.end();
    await root.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await root.end();
    await applicationPool.end();
  }
});
