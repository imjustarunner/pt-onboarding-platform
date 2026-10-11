import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), start: vi.fn(), event: vi.fn(), report: vi.fn(), query: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../services/documentAnalytics.service.js', () => ({ startDocumentReading: m.start, recordDocumentEvent: m.event, documentAnalyticsReport: m.report, queryDocumentAnalytics: m.query }));
import { portal, report } from '../documentAnalytics.controller.js';
beforeEach(() => vi.resetAllMocks());
describe('analytics request identity', () => {
  it('binds portal events to the token user and company, never submitted IDs', async () => {
    m.execute.mockResolvedValue([[{ id: 8, agency_id: 2, role: 'provider', status: 'PREHIRE' }]]); m.start.mockResolvedValue({ sessionId: 'sample' });
    const res = { set: vi.fn(), json: vi.fn() }, next = vi.fn();
    await portal('start')({ portalUser: { id: 8 }, body: { userId: 99, agencyId: 99, documentKey: 'workplace-handbook', surface: 'library' } }, res, next);
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }), expect.objectContaining({ agencyId: 2, surface: 'prehire' }));
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store'); expect(next).not.toHaveBeenCalled();
  });
  it('rejects arbitrary guide tracking in the prehire portal', async () => {
    m.execute.mockResolvedValueOnce([[{ id: 8, agency_id: 2, status: 'PREHIRE' }]]).mockResolvedValueOnce([[]]);
    const next = vi.fn(); await portal('start')({ portalUser: { id: 8 }, body: { documentKey: 'provider-guide', versionId: 12 } }, { set: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(m.start).not.toHaveBeenCalled();
  });
  it('uses the assigned-training company and verifies the assigned edition', async () => {
    m.execute.mockResolvedValueOnce([[{ id: 8, agency_id: 12, status: 'ONBOARDING' }]]).mockResolvedValueOnce([[{ id: 44 }]]);
    const next = vi.fn(); await portal('start')({ portalUser: { id: 8 }, body: { agencyId: 99, documentKey: 'provider-guide', versionId: 120 } }, { set: vi.fn(), json: vi.fn() }, next);
    expect(m.execute.mock.calls[0][0]).toContain('JOIN hire_journeys');
    expect(m.execute.mock.calls[1][1]).toEqual([12, 8, 'provider-guide', 120]);
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ id: 8, analyticsPortalVerified: true }), expect.objectContaining({ agencyId: 12, surface: 'onboarding' }));
    expect(next).not.toHaveBeenCalled();
  });
  it('does not accept a forged document or company on a portal heartbeat', async () => {
    m.execute.mockResolvedValueOnce([[{ agency_id: 12, document_key: 'provider-guide', version_id: 120 }]]).mockResolvedValueOnce([[{ id: 8, agency_id: 2, status: 'ONBOARDING' }]]);
    const next = vi.fn(); await portal('event')({ portalUser: { id: 8 }, body: { sessionId: 'sample', agencyId: 2, documentKey: 'workplace-handbook' } }, { set: vi.fn() }, next);
    expect(m.execute.mock.calls[1][0]).toContain('JOIN hire_journeys');
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(m.event).not.toHaveBeenCalled();
  });
  it('passes authenticated report identity through without accepting a body user', async () => {
    const user = { id: 7, role: 'admin' }, res = { set: vi.fn(), json: vi.fn() };
    await report({ user, query: { agencyId: '2' }, body: { userId: 99 } }, res, vi.fn());
    expect(m.report).toHaveBeenCalledWith(user, 2, { agencyId: '2' });
  });
});
