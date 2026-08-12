import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import IntakeRetentionCleanupService, {
  INTAKE_AUTO_DELETE_ENABLED
} from '../intakeRetentionCleanup.service.js';

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore
  }
});

test('intake retention cleanup never auto-deletes packets or PHI', async () => {
  assert.equal(INTAKE_AUTO_DELETE_ENABLED, false);
  const result = await IntakeRetentionCleanupService.run({ limit: 300 });
  assert.equal(result.skipped, true);
  assert.equal(result.deletedSubmissions, 0);
  assert.equal(result.deletedPhiDocs, 0);
  assert.equal(result.deletedObjects, 0);
});
