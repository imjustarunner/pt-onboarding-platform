import test, { after } from 'node:test';
import assert from 'node:assert/strict';

if (process.env.AURICWELL_TEST_DATABASE !== 'local-disposable') throw new Error('Disposable database required.');
Object.assign(process.env, { NODE_ENV: 'test', SKIP_DB_CONNECT: '1',
  CLINICAL_DB_HOST: '127.0.0.1', CLINICAL_DB_PORT: '33471', CLINICAL_DB_NAME: 'auricwell_test',
  CLINICAL_DB_USER: 'auricwell_test', CLINICAL_DB_PASSWORD: 'auricwell-test-only' });
const { default: pool } = await import('../../config/clinicalDatabase.js');
const { default: ClinicalSession } = await import('../../models/clinical/ClinicalSession.model.js');
after(async () => { await pool.end(); });

test('H0002 and another service remain separate, and signed or claimed encounters are never reused', async () => {
  // A minimal projection in the runner's private temporary database; never a project database.
  await pool.query(`CREATE TABLE IF NOT EXISTS clinical_sessions (
    id INT PRIMARY KEY, agency_id INT, client_id INT, provider_user_id INT,
    office_event_id INT NULL, billing_encounter_id INT NULL, scheduled_start_at DATETIME,
    service_code VARCHAR(32), encounter_status VARCHAR(32))`);
  await pool.query('CREATE TABLE IF NOT EXISTS clinical_claims (id INT PRIMARY KEY, clinical_session_id INT)');
  await pool.query('CREATE TABLE IF NOT EXISTS clinical_notes (id INT PRIMARY KEY, clinical_session_id INT, provider_signed_at DATETIME NULL)');
  await pool.query(`INSERT INTO clinical_sessions (id,agency_id,client_id,provider_user_id,scheduled_start_at,service_code,encounter_status)
    VALUES (7801,2,17,30,'2026-10-13 12:00:00','90834','completed'),
      (7802,2,17,31,'2026-10-13 12:00:00','H0002','completed'),
      (7803,2,17,30,'2026-10-13 12:00:00','H0002','completed'),
      (7804,2,17,30,'2026-10-13 12:00:00','H0002','completed'),
      (7805,2,17,30,'2026-10-13 12:00:00','H0002','completed'),
      (7806,2,17,30,'2026-10-13 12:00:00','H0002','cancelled'),
      (7807,6,17,30,'2026-10-13 12:00:00','H0002','completed')`);
  await pool.query('INSERT INTO clinical_claims VALUES (7804,7804)');
  await pool.query("INSERT INTO clinical_notes VALUES (7805,7805,'2026-10-13 15:00:00')");
  const scope = { agencyId: 2, clientId: 17, providerUserId: 30, serviceDate: '2026-10-13' };
  assert.equal((await ClinicalSession.findNoteAidDraftSession({ ...scope, serviceCode: 'H0002' })).id, 7803);
  assert.equal((await ClinicalSession.findNoteAidDraftSession({ ...scope, serviceCode: '90834' })).id, 7801);
  assert.equal(await ClinicalSession.findNoteAidDraftSession({ ...scope, serviceCode: '90791' }), null);
});
