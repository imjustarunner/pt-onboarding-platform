import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), agencies: vi.fn(), resource: vi.fn(), capabilities: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: m }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.agencies } }));
vi.mock('../../models/Library.model.js', () => ({ default: { findResource: m.resource } }));
vi.mock('../../utils/capabilities.js', () => ({ getUserCapabilities: m.capabilities }));
import { assertAnalyticsAccess, analyticsDocument, activeReadingSeconds, safeAnalyticsTarget, analyticsRange, startDocumentReading, recordDocumentEvent, documentAnalyticsReport, queryDocumentAnalytics, recordDocumentQuestion } from '../documentAnalytics.service.js';
import { documentAnalyticsIntent } from '../agents/documentAnalyticsIntent.js';
const admin = { id: 7, role: 'admin' }, reader = { id: 8, role: 'provider' }, sessionId = 'aabbccdd-1111-2222-3333-123456789012';
let db, row;
beforeEach(() => {
  vi.resetAllMocks(); m.agencies.mockResolvedValue([{ id: 2 }]); m.capabilities.mockReturnValue({ canViewLibrary: true });
  row = { id: sessionId, user_id: 8, agency_id: 2, document_key: 'provider-guide', document_title: 'Provider’s Guide', version_id: 12, surface: 'library', coverage: 'native', section_slug: 'welcome', active: 1, sequence_number: 1, seen_at: new Date('2026-10-10T12:00:00Z') };
  db = { execute: m.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }; m.getConnection.mockResolvedValue(db);
  m.execute.mockImplementation(async sql => {
    if (sql.includes('FROM agencies')) return [[{ id: 2, slug: 'itsco', name: 'ITSCO' }]];
    if (sql.includes('FROM company_reference_documents')) return [[{ id: 12, metadata_json: { title: 'Provider’s Guide' }, sections_json: [{ slug: 'welcome', title: 'Welcome' }] }]];
    if (sql.includes('FROM document_reading_sessions WHERE id')) return [[row]];
    if (sql.includes('SELECT MAX(credited_through_at)')) return [[{ seen_at: null }]];
    if (sql.includes('SELECT UTC_TIMESTAMP')) return [[{ now: new Date('2026-10-10T12:00:15Z') }]];
    if (sql.includes('SELECT * FROM users')) return [[reader]];
    return [{ affectedRows: 1 }];
  });
});
describe('statistics authorization', () => {
  it.each(['provider', 'staff', 'support', 'supervisor', 'intern'])('does not expose people or questions to %s', async role => {
    await expect(documentAnalyticsReport({ id: 7, role }, 2)).rejects.toMatchObject({ status: 403 }); expect(m.execute).not.toHaveBeenCalled();
  });
  it('requires membership for an administrator and honors a reduced effective role', async () => {
    m.agencies.mockResolvedValue([{ id: 3 }]); await expect(assertAnalyticsAccess(admin, 2, { report: true })).rejects.toMatchObject({ status: 403 });
    await expect(assertAnalyticsAccess({ ...admin, role: 'super_admin', effectiveRole: 'provider' }, 2, { report: true })).rejects.toMatchObject({ status: 403 });
    await expect(assertAnalyticsAccess({ id: 7, role: 'super_admin' }, 2, { report: true })).resolves.toBeUndefined();
  });
  it('excludes private resources and company-inapplicable guides', async () => {
    m.resource.mockResolvedValue({ id: 1, scope: 'personal' }); await expect(analyticsDocument(reader, 2, 'resource:1')).rejects.toMatchObject({ status: 404 });
    m.execute.mockResolvedValue([[{ id: 2, slug: 'nlu' }]]); await expect(analyticsDocument(reader, 2, 'school-practice-guide')).rejects.toMatchObject({ status: 404 });
  });
});
describe('honest engagement measurements', () => {
  it('counts observed time, caps gaps and deduplicates overlapping tabs', () => {
    const input = { sequence: 2, active: true };
    expect(activeReadingSeconds(row, input, '2026-10-10T12:00:15Z')).toBe(15);
    expect(activeReadingSeconds(row, input, '2026-10-10T12:00:35Z')).toBe(20);
    expect(activeReadingSeconds(row, input, '2026-10-10T12:05:00Z')).toBe(0);
    expect(activeReadingSeconds(row, { ...input, active: false }, '2026-10-10T12:00:15Z')).toBe(0);
    expect(activeReadingSeconds(row, { ...input, sequence: 1 }, '2026-10-10T12:00:15Z')).toBe(0);
    expect(activeReadingSeconds(row, input, '2026-10-10T12:00:15Z', '2026-10-10T12:00:14Z')).toBe(1);
  });
  it('resolves titles and version from the server, with retry-safe open identity', async () => {
    await startDocumentReading(reader, { agencyId: 2, sessionId, documentKey: 'provider-guide', versionId: 12, title: 'Spoofed', surface: 'library' });
    const insert = m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT IGNORE INTO document_reading_events'));
    expect(insert[1][0]).toBe(`${sessionId}:open`); expect(insert[1]).toContain('Provider’s Guide'); expect(insert[1]).not.toContain('Spoofed'); expect(db.commit).toHaveBeenCalled();
  });
  it('rejects session theft and forged question events', async () => {
    row.user_id = 99; await expect(startDocumentReading(reader, { agencyId: 2, sessionId, documentKey: 'provider-guide', versionId: 12 })).rejects.toMatchObject({ status: 409 });
    await expect(recordDocumentEvent(reader, { agencyId: 2, sessionId, sequence: 2, type: 'question', active: true })).rejects.toMatchObject({ status: 400 });
  });
  it('ignores replayed events and never accepts a client-supplied duration', async () => {
    expect(await recordDocumentEvent(reader, { agencyId: 2, sessionId, sequence: 1, type: 'heartbeat', active: true, duration: 9999 })).toEqual({ recorded: false, creditedSeconds: 0 });
    expect(await recordDocumentEvent(reader, { agencyId: 2, sessionId, sequence: 2, type: 'heartbeat', active: true, duration: 9999 })).toEqual({ recorded: true, creditedSeconds: 15 });
    expect(m.execute.mock.calls.some(([sql]) => /payroll|learning_time/.test(sql))).toBe(false);
  });
  it('stores one current rating per reader/section and strips URL secrets', async () => {
    await recordDocumentEvent(reader, { agencyId: 2, sessionId, sequence: 2, type: 'helpful', active: true, sectionSlug: 'welcome' });
    expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM document_reading_events'))).toBe(true);
    expect(safeAnalyticsTarget('https://example.com/private/token?signature=secret')).toBe('External: example.com');
    expect(safeAnalyticsTarget('/client/secret?token=password')).toBe('App link');
    expect(safeAnalyticsTarget('/library?companyDocument=provider-guide#provider-guide-welcome')).toBe('document:provider-guide#provider-guide-welcome');
    expect(safeAnalyticsTarget('javascript:alert(1)')).toBe('Other link');
  });
  it('deduplicates time already credited to a tab even after that tab becomes inactive', async () => {
    const execute = m.execute.getMockImplementation();
    m.execute.mockImplementation((sql, args) => sql.includes('MAX(credited_through_at)') ? [[{ seen_at: new Date('2026-10-10T12:00:14Z') }]] : execute(sql, args));
    const result = await recordDocumentEvent(reader, { agencyId: 2, sessionId, sequence: 2, type: 'heartbeat', active: true });
    expect(result.creditedSeconds).toBe(1);
    const [query] = m.execute.mock.calls.find(([sql]) => sql.includes('MAX(credited_through_at)'));
    expect(query).not.toContain('active = 1');
    expect(m.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE document_reading_sessions'))[1]).toContain(1);
  });
  it('resolves document access before acquiring the transaction, avoiding pool starvation', async () => {
    const execute = m.execute.getMockImplementation();
    m.execute.mockImplementation((sql, args) => {
      if (sql.includes('FROM company_reference_documents')) expect(db.beginTransaction).not.toHaveBeenCalled();
      return execute(sql, args);
    });
    await recordDocumentEvent(reader, { agencyId: 2, sessionId, sequence: 2, type: 'heartbeat', active: true });
    expect(db.commit).toHaveBeenCalled();
  });
  it('keeps editable-resource events on the edition opened rather than a later autosave', async () => {
    row.document_key = 'resource:1'; row.document_title = 'Team document'; row.version_id = 3;
    m.resource.mockResolvedValue({ id: 1, name: 'Newer title', scope: 'organization', version: 4 });
    await recordDocumentEvent(reader, { agencyId: 2, sessionId, sequence: 2, type: 'link', active: true, href: '#intro' });
    const event = m.execute.mock.calls.find(([sql, args]) => sql.startsWith('INSERT IGNORE INTO document_reading_events') && args.includes('link'))[1];
    expect(event[4]).toBe('Team document'); expect(event[5]).toBe(3);
  });
  it('logs actual server Q&A outcomes with the authorized user, not an answer transcript', async () => {
    // The assigned-training endpoint already authorized this learner; general
    // Library access is not required to record the question they actually asked.
    m.capabilities.mockReturnValue({ canViewLibrary: false });
    await recordDocumentQuestion({ agencyId: 2, userId: 8, documentKey: 'provider-guide', versionId: 12, question: 'What must a note include?', status: 'answered' });
    const insert = m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT IGNORE INTO document_reading_events'));
    expect(insert[1]).toContain('What must a note include?'); expect(insert[1][2]).toBe(8); expect(insert[1]).toContain('answered');
  });
});
describe('bounded reports and assistant queries', () => {
  it('validates dates and includes the entire final UTC date', () => {
    expect(analyticsRange({ startDate: '2026-10-01', endDate: '2026-10-10' })).toMatchObject({ from: '2026-10-01 00:00:00', until: '2026-10-11 00:00:00' });
    for (const range of [{ startDate: '2026-02-30' }, { startDate: '2026-10-11', endDate: '2026-10-10' }, { startDate: '2020-01-01', endDate: '2026-10-10' }]) expect(() => analyticsRange(range)).toThrow();
  });
  it('binds company, date, document and person filters on every detail query', async () => {
    m.execute.mockResolvedValue([[{ opens: 3, readers: 2, activeSeconds: 90, collectionStartedAt: null }]]);
    const r = await documentAnalyticsReport(admin, 2, { startDate: '2026-10-01', endDate: '2026-10-10', documentKey: 'provider-guide', userId: 8 });
    expect(r.summary.opens).toBe(3);
    const details = m.execute.mock.calls.filter(([sql]) => sql.includes('FROM document_reading_events e'));
    expect(details).toHaveLength(8);
    for (const [, params] of details) expect(params).toEqual([2, '2026-10-01 00:00:00', '2026-10-11 00:00:00', 'provider-guide', 8]);
    await expect(documentAnalyticsReport(admin, 2, { offset: '0; DROP TABLE users' })).rejects.toMatchObject({ status: 400 });
  });
  it('asks which document rather than merging ambiguous matches', async () => {
    m.execute.mockImplementation(async sql => sql.includes('FROM agencies') ? [[{ slug: 'itsco' }]] : [[]]);
    const r = await queryDocumentAnalytics(admin, 2, { documentQuery: 'guide' });
    expect(r.needsClarification).toBe(true); expect(r.choices.length).toBeGreaterThan(1);
  });
  it('routes common administration questions with explicit dates and a fixed tool', () => {
    expect(documentAnalyticsIntent('Who opened the provider guide in the last 7 days?', new Date('2026-10-10T12:00:00Z')).toolCalls[0]).toMatchObject({ name: 'queryDocumentAnalytics', args: { documentKey: 'provider-guide', detail: 'people', startDate: '2026-10-04', endDate: '2026-10-10' } });
    expect(documentAnalyticsIntent('What questions were asked about the handbook from 2026-10-01 through 2026-10-10?').toolCalls[0].args.detail).toBe('questions');
    expect(documentAnalyticsIntent('What does the handbook say about PTO?')).toBeNull();
  });
});
