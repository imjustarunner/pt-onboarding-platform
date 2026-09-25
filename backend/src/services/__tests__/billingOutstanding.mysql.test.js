import test from 'node:test';
import assert from 'node:assert/strict';
test('a later settled report closes existing receivables without dropping payer follow-up', { skip: process.env.FAMILY_BILLING_MYSQL_TEST !== '1' }, async () => {
  assert.equal(process.env.DB_NAME, 'family_billing_test'); assert.equal(process.env.DB_HOST, '127.0.0.1'); assert.equal(process.env.DB_PORT, '33316');
  const { default: pool } = await import('../../config/database.js');
  const { default: clinical } = await import('../../config/clinicalDatabase.js');
  const { projectReceivablesFromLines } = await import('../billingReportIngest.service.js');
  const { default: Reports } = await import('../../models/ReceivablesReportRow.model.js');
  try {
    await pool.execute('INSERT INTO billing_report_uploads (id,agency_id) VALUES (1,1),(2,1),(3,2)');
    await pool.execute("INSERT INTO billing_report_lines (id,upload_id,agency_id,line_fingerprint,patient_balance,insurance_outstanding,insurance_amount,insurance_amount_paid) VALUES (1,1,1,?,25,80,200,120),(2,1,1,?,0,80,200,120),(3,3,2,?,25,80,200,120)", ['a'.repeat(64),'b'.repeat(64),'a'.repeat(64)]);
    await projectReceivablesFromLines({ agencyId: 1, uploadId: 1, actingUserId: 99 });
    await projectReceivablesFromLines({ agencyId: 2, uploadId: 3, actingUserId: 99 });
    assert.equal((await Reports.listOutstanding({ agencyId: 1, collectionsStatus: 'open' })).length, 2);
    await pool.execute('UPDATE billing_report_lines SET upload_id=2,patient_balance=0,insurance_outstanding=0 WHERE id=1');
    await projectReceivablesFromLines({ agencyId: 1, uploadId: 2, actingUserId: 99 });
    await projectReceivablesFromLines({ agencyId: 1, uploadId: 2, actingUserId: 99 });
    const [[closed]] = await pool.execute('SELECT * FROM agency_receivables_report_rows WHERE agency_id=1 AND row_fingerprint=?', ['a'.repeat(64)]);
    assert.equal(closed.collections_status, 'closed'); assert.equal(Number(closed.patient_outstanding_amount), 0); assert.equal(Number(closed.insurance_outstanding_amount), 0);
    const open = await Reports.listOutstanding({ agencyId: 1, collectionsStatus: 'open' });
    assert.equal(open.length, 1); assert.equal(Number(open[0].insurance_outstanding_amount), 80);
    assert.equal((await Reports.listOutstanding({ agencyId: 2, collectionsStatus: 'open' })).length, 1);
    const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM agency_receivables_report_rows WHERE agency_id=1'); assert.equal(count.n, 2);
  } finally { await pool.end(); await clinical.end(); }
});
