import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import { assertEvidenceStorage, requireSecurityReadiness, evidenceFailure } from '../securityEvidence.service.js';

const triggers = [
  { TRIGGER_NAME: 'security_evidence_no_update', EVENT_MANIPULATION: 'UPDATE', ACTION_TIMING: 'BEFORE' },
  { TRIGGER_NAME: 'security_evidence_no_delete', EVENT_MANIPULATION: 'DELETE', ACTION_TIMING: 'BEFORE' }
];

describe('evidence startup gate', () => {
  beforeEach(() => {
    db.execute.mockReset();
    vi.stubEnv('AUDIT_PROXY_MODE', 'unverified');
    vi.stubEnv('MFA_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 1).toString('base64'));
  });
  it('refuses to start when the evidence table cannot be read', async () => {
    db.execute.mockRejectedValue(Object.assign(new Error('Unavailable'), { code: 'ER_NO_SUCH_TABLE' }));
    await expect(assertEvidenceStorage()).rejects.toMatchObject({ code: 'ER_NO_SUCH_TABLE' });
  });
  it('refuses to start when the append-only triggers are missing', async () => {
    db.execute.mockResolvedValue([[]]);
    await expect(assertEvidenceStorage()).rejects.toThrow('Required append-only evidence trigger is missing');
  });
  it('requires both before-update and before-delete safeguards', async () => {
    db.execute.mockImplementation(async sql => sql.includes('information_schema.TRIGGERS') ? [[{ TRIGGER_NAME: 'security_evidence_no_update', EVENT_MANIPULATION: 'UPDATE', ACTION_TIMING: 'BEFORE' }]] : [[]]);
    await expect(assertEvidenceStorage()).rejects.toThrow('security_evidence_no_delete');
  });
  it('identifies a missing evidence table without exposing the raw database error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.execute.mockRejectedValue(Object.assign(new Error('private database details'), { code: 'ER_NO_SUCH_TABLE' }));
    await expect(requireSecurityReadiness()).rejects.toMatchObject({
      code: 'ER_NO_SUCH_TABLE', component: 'security_evidence', requiredMigration: '1456'
    });
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ phase: 'startup', component: 'security_evidence', requiredMigration: '1456' });
    expect(log.mock.calls.flat().join(' ')).not.toContain('private database details');
  });
  it('reports missing session history columns with both prerequisite migrations', async () => {
    db.execute.mockImplementation(async sql => {
      if (sql.includes('FROM auth_session_security')) throw Object.assign(new Error('missing column'), { code: 'ER_BAD_FIELD_ERROR' });
      return [[]];
    });
    await expect(assertEvidenceStorage()).rejects.toMatchObject({ code: 'ER_BAD_FIELD_ERROR', component: 'auth_session_security', requiredMigration: '1452,1458' });
  });
  it('refuses an absent MFA key even when the schema exists', async () => {
    db.execute.mockResolvedValue([[]]);
    vi.stubEnv('MFA_ENCRYPTION_KEY_BASE64', '');
    await expect(assertEvidenceStorage()).rejects.toMatchObject({ code: 'MFA_KEY_NOT_CONFIGURED', component: 'MFA_ENCRYPTION_KEY_BASE64' });
  });
  it('permits startup only after all checks pass', async () => {
    db.execute.mockImplementation(async sql => sql.includes('information_schema.TRIGGERS') ? [triggers] : [[]]);
    await expect(requireSecurityReadiness()).resolves.toBeUndefined();
  });
  it('adds actionable diagnostics to received-phase failures without logging SQL', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    evidenceFailure({ code: 'ER_NO_SUCH_TABLE', sql: 'private data' }, 'request-id', 'received');
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ severity: 'CRITICAL', type: 'security_evidence_failure', requestId: 'request-id', phase: 'received', code: 'ER_NO_SUCH_TABLE', component: 'security_evidence', requiredMigration: '1456' });
  });
});
