import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import Activity from '../../models/UserActivityLog.model.js';
import Admin from '../../models/AdminAuditLog.model.js';
import pool from '../../config/database.js';
import { auditCsvEscape, auditIdSearchExpressions, projectAuditRowForSupport } from '../auditReviewAccess.service.js';

it('support SQL search cannot use hidden metadata, addresses, network details or target-user profiles', () => {
  for (const [model, method] of [[Activity, 'buildAgencyActivityWhere'], [Admin, 'buildWhere']]) {
    const result = model[method]({ agencyId: 450, clientId: 2297, search: 'secret', supportView: true });
    expect(result.where).not.toMatch(/CAST\((?:ual|aal)\.metadata AS CHAR\)|\.email|\.ip_address|\.session_id|target\.first_name/);
    expect(result.where).toContain("'$.clientId'"); expect(result.where).toContain('REGEXP');
    expect(result.params).toContain('2297');
    expect(model[method]({ agencyId: 450, search: 'secret' }).where).toMatch(/\.email/);
  }
});
it('only searches numeric IDs from allowed JSON paths', () => {
  expect(auditIdSearchExpressions('l.metadata').join(' ')).toContain("REGEXP '^[0-9]+$'");
  const row = projectAuditRowForSupport({ id: 1, metadata: { clientId: 'private narrative', noteId: 42, secret: 'hidden' } });
  expect(row.metadata).toEqual({ noteId: 42 }); expect(row.target_label).toBe('Note #42');
});
it('neutralizes spreadsheet formulas and correctly quotes multiline or quoted values', () => {
  expect(auditCsvEscape('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
  expect(auditCsvEscape(' +cmd')).toBe("' +cmd"); expect(auditCsvEscape('line\rbreak')).toBe('"line\rbreak"');
  expect(auditCsvEscape(1439)).toBe('1439');
});
it('expands model queries for a combined page or export without truncating every source at 500', async () => {
  pool.execute.mockResolvedValue([[]]);
  await Activity.getAgencyActivityLog({ agencyId: 450, expandedReview: true, limit: 750 });
  expect(pool.execute.mock.lastCall[0]).toContain('LIMIT 750');
  await Admin.getAgencyAuditLogPaged({ agencyId: 450, expandedReview: true, limit: 10001 });
  expect(pool.execute.mock.lastCall[0]).toContain('LIMIT 10001');
  await Activity.getAgencyActivityLog({ agencyId: 450, limit: 750 });
  expect(pool.execute.mock.lastCall[0]).toContain('LIMIT 500');
});
