import test from 'node:test';
import assert from 'node:assert/strict';
test('deposit evidence persistence and resumable bank checks', { skip: process.env.FAMILY_BILLING_MYSQL_TEST !== '1' }, async t => {
  for (const [key, value] of Object.entries({ DB_HOST: '127.0.0.1', DB_PORT: '33316', DB_NAME: 'family_billing_test' })) assert.equal(process.env[key], value);
  process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 5).toString('base64');
  process.env.BANK_FEEDS_ENABLED = 'true';
  const { default: pool } = await import('../../config/database.js');
  const { default: clinicalPool } = await import('../../config/clinicalDatabase.js');
  const { encryptFamilyBilling, decryptFamilyBilling } = await import('../familyBillingEncryption.service.js');
  const { storeBankTransaction, syncBankFeed, bankFeedOverview } = await import('../bankFeed.service.js');
  const era = { eraId: '900', trace: 'REF123456', originatorId: '1123456789', amountCents: 25714, currency: 'usd', paidDate: '2026-09-15' };
  const value = { id: 'fctxn_test', account: 'fca_test', livemode: false, amount: 25714, currency: 'usd', description: 'PRIVATE unrelated prefix TRN*1*REF123456*1123456789~', status: 'posted', updated: 1789560000, transacted_at: 1789560000, status_transitions: { posted_at: Date.parse('2026-09-16T12:00:00Z') / 1000 } };
  const account = { id: 1, agency_id: 1, external_id: 'fca_test', livemode: 0 };
  async function store(v) { const db = await pool.getConnection(); try { await db.beginTransaction(); const result = await storeBankTransaction(db, account, v); await db.commit(); return result; } catch (e) { await db.rollback(); throw e; } finally { db.release(); } }
  async function status() { const [[row]] = await pool.execute('SELECT status FROM bank_deposit_verifications WHERE id=1'); return row.status; }
  try {
    for (const id of [1, 2]) {
      await pool.execute('INSERT INTO bank_feed_accounts (id,agency_id,external_id,stripe_customer_id,livemode,details_encrypted,connected_by_user_id,sync_enabled) VALUES (?,?,?,?,?,?,?,1)', [id, id, `fca_${id === 1 ? 'test' : 'other'}`, `cus_${id}`, 0, encryptFamilyBilling({ institution: 'Synthetic Bank', name: 'Checking', last4: '0000' }, `bank-account:${id}:fca_${id === 1 ? 'test' : 'other'}`), 9]);
      const key = String(id).repeat(64);
      await pool.execute('INSERT INTO bank_deposit_verifications (id,agency_id,account_id,era_key,era_encrypted,requested_by_user_id) VALUES (?,?,?,?,?,9)', [id, id, id, key, encryptFamilyBilling(era, `bank-era:${id}:${key}`)]);
    }
    await t.test('unrelated and pending activity creates no bank transaction record', async () => {
      assert.equal(await store({ ...value, description: 'PRIVATE payroll' }), false);
      assert.equal(await store({ ...value, status: 'pending' }), false);
      const [[row]] = await pool.execute('SELECT COUNT(*) AS n FROM bank_feed_transactions'); assert.equal(row.n, 0);
    });
    await t.test('a match is retained once without its description; other agencies cannot see it', async () => {
      assert.equal(await store(value), true); await store(value);
      assert.equal(await status(), 'verified');
      const [[row]] = await pool.execute('SELECT * FROM bank_feed_transactions');
      const evidence = decryptFamilyBilling(row.evidence_encrypted, 'bank-transaction:1:1');
      assert.equal(evidence.trace, era.trace); assert.equal(evidence.description, undefined); assert.ok(!JSON.stringify(row).includes('PRIVATE'));
      const [[versions]] = await pool.execute('SELECT COUNT(*) AS n FROM bank_feed_transaction_versions'); assert.equal(versions.n, 1);
      await assert.rejects(bankFeedOverview(2, 1), /not found/);
    });
    await t.test('duplicate deposits cannot double-verify an ERA; voids preserve history and require review', async () => {
      await store({ ...value, id: 'fctxn_duplicate' }); assert.equal(await status(), 'manual_review');
      await store({ ...value, status: 'void', updated: value.updated + 1 });
      await store(value); // stale event cannot restore a void
      const [[row]] = await pool.execute('SELECT * FROM bank_feed_transactions');
      assert.equal(decryptFamilyBilling(row.evidence_encrypted, 'bank-transaction:1:1').status, 'void');
      const [[versions]] = await pool.execute('SELECT COUNT(*) AS n FROM bank_feed_transaction_versions'); assert.equal(versions.n, 2);
      assert.equal(await status(), 'manual_review');
    });
    await t.test('a failed later page resumes without skipping evidence or retaining unrelated activity', async () => {
      const requests = [];
      let fail = true;
      const stripe = { financialConnections: {
        accounts: { retrieve: async () => ({ id: 'fca_other', livemode: false, account_holder: { customer: 'cus_2' }, status: 'active', category: 'cash', permissions: ['transactions'], transaction_refresh: { id: 'fctxnref_one', status: 'succeeded' } }) },
        transactions: { list: async params => { requests.push(params); if (!params.starting_after) return { data: [{ ...value, account: 'fca_other', id: 'fctxn_pageone' }], has_more: true }; if (fail) throw new Error('synthetic page failure'); return { data: [{ ...value, account: 'fca_other', id: 'fctxn_unrelated', description: 'PRIVATE unrelated purchase' }], has_more: false }; } }
      } };
      await assert.rejects(syncBankFeed(2, 2, { db: pool, stripe, livemode: false }), /synthetic page failure/);
      const [[partial]] = await pool.execute('SELECT * FROM bank_feed_accounts WHERE id=2');
      assert.equal(partial.page_cursor, 'fctxn_pageone'); assert.equal(partial.last_refresh, null);
      fail = false; await syncBankFeed(2, 2, { db: pool, stripe, livemode: false });
      assert.equal(requests.at(-1).starting_after, 'fctxn_pageone');
      const [[done]] = await pool.execute('SELECT * FROM bank_feed_accounts WHERE id=2');
      assert.equal(done.page_cursor, null); assert.equal(done.last_refresh, 'fctxnref_one');
      const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM bank_feed_transactions WHERE agency_id=2'); assert.equal(count.n, 1);
    });
  } finally { await pool.end(); await clinicalPool.end(); }
});
