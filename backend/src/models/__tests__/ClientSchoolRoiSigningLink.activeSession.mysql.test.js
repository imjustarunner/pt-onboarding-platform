import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from '../../services/__tests__/fixtures/isolatedWorkflowMysql.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => state.db.execute(...args) } }));
import ClientSchoolRoiSigningLink from '../ClientSchoolRoiSigningLink.model.js';

describe.skipIf(!recoveryMysqlEnabled)('issued ROI active-session writes in isolated MySQL', () => {
  let fixture;
  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('issued_roi_session');
    state.db = fixture.db;
    await state.db.query(`CREATE TABLE intake_links (id INT PRIMARY KEY, title VARCHAR(80), language_code VARCHAR(8))`);
    await state.db.query(`CREATE TABLE client_school_roi_signing_links (
      id INT PRIMARY KEY, client_id INT, school_organization_id INT, intake_link_id INT,
      status VARCHAR(20), latest_intake_submission_id INT, roi_context_json TEXT,
      roi_response_json TEXT, access_applied_at DATETIME NULL, updated_at DATETIME NULL
    )`);
    await state.db.query(`INSERT INTO intake_links VALUES (20, 'Synthetic school release', 'en')`);
  });
  beforeEach(async () => {
    await state.db.query('DELETE FROM client_school_roi_signing_links');
    await state.db.execute(`INSERT INTO client_school_roi_signing_links
      (id, client_id, school_organization_id, intake_link_id, status, latest_intake_submission_id, roi_context_json, roi_response_json)
      VALUES (8, 928, 451, 20, 'in_progress', 10, ?, ?)`,
    [JSON.stringify({ originalContext: true }), JSON.stringify({ originalDecision: true })]);
  });
  afterAll(async () => { if (fixture) await fixture.close(); });

  it('saves context only for the currently active issued request session', async () => {
    const result = await ClientSchoolRoiSigningLink.updatePayload({ id: 8, intakeSubmissionId: 10,
      expectedActiveSubmissionId: 10, roiContext: { currentContext: true }, roiResponse: null });
    expect(result).toMatchObject({ status: 'in_progress', latest_intake_submission_id: 10,
      roi_context_json: { currentContext: true }, roi_response_json: null });
  });

  it('preserves a concurrently completed request and its historical source and decisions', async () => {
    await state.db.execute(`UPDATE client_school_roi_signing_links SET status = 'completed' WHERE id = 8`);
    const result = await ClientSchoolRoiSigningLink.updatePayload({ id: 8, intakeSubmissionId: 11,
      expectedActiveSubmissionId: 10, roiContext: { replacement: true }, roiResponse: null });
    expect(result).toMatchObject({ status: 'completed', latest_intake_submission_id: 10,
      roi_context_json: { originalContext: true }, roi_response_json: { originalDecision: true } });
    const started = await ClientSchoolRoiSigningLink.markStarted({ id: 8, intakeSubmissionId: 11 });
    expect(started).toMatchObject({ status: 'completed', latest_intake_submission_id: 10 });
  });

  it('does not let an earlier opening replace a newer session pointer or context', async () => {
    await state.db.execute(`UPDATE client_school_roi_signing_links SET latest_intake_submission_id = 12 WHERE id = 8`);
    const result = await ClientSchoolRoiSigningLink.updatePayload({ id: 8, intakeSubmissionId: 10,
      expectedActiveSubmissionId: 10, roiContext: { stale: true }, roiResponse: null });
    expect(result).toMatchObject({ status: 'in_progress', latest_intake_submission_id: 12,
      roi_context_json: { originalContext: true }, roi_response_json: { originalDecision: true } });
  });

  it('retains existing unguarded finalization payload behavior for its existing callers', async () => {
    const result = await ClientSchoolRoiSigningLink.updatePayload({ id: 8, intakeSubmissionId: 10,
      roiContext: { finalized: true }, roiResponse: { allowed: true } });
    expect(result).toMatchObject({ latest_intake_submission_id: 10,
      roi_context_json: { finalized: true }, roi_response_json: { allowed: true } });
  });
});
