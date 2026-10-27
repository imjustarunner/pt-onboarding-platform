import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2 })) } }));
vi.mock('../../services/schoolCoverageMetrics.service.js', () => ({
  safeInt: value => Number(value) || null,
  getSchoolCoverageSummary: vi.fn(), getProviderCoverageSummary: vi.fn(),
  getSchoolDetail: vi.fn(), getProviderDetail: vi.fn()
}));
vi.mock('../../services/schoolCoverageWarnings.service.js', () => ({ getCoverageWarnings: vi.fn() }));
vi.mock('../../services/openSchoolDays.service.js', () => ({ getOpenSchoolDays: vi.fn() }));
vi.mock('../../services/schoolPortalDaySync.service.js', () => ({ syncSchoolPortalDayProvider: vi.fn() }));
vi.mock('../../services/schoolPortalEvents.service.js', () => ({ enableSchoolEventProviderStaffing: vi.fn() }));
vi.mock('../../services/d11Compliance.service.js', () => ({ enqueueD11ComplianceEnsure: vi.fn() }));
import { listHubEvents } from '../schoolCoverage.controller.js';

const address = '123 Main St, Denver, CO 80202';
beforeEach(() => vi.clearAllMocks());

describe('Outreach Hub venue reload', () => {
  it.each([false, true])('returns saved venue fields through the hub read (legacy query: %s)', async legacy => {
    let attempts = 0;
    m.execute.mockImplementation(async sql => {
      if (sql.includes('FROM user_agencies')) return [[{ 1: 1 }]];
      if (!sql.includes('FROM company_events ce')) return [[]];
      if (legacy && attempts++ === 0) throw Object.assign(new Error('Unknown column school_event_status'), { code: 'ER_BAD_FIELD_ERROR' });
      // Model the SELECT projection so a missing SQL column cannot be hidden by the mock.
      const row = { id: 15, title: 'Testing', event_type: 'school_outreach', is_active: 1 };
      for (const [column, value] of Object.entries({ event_location_name: 'Community center', event_location_address: address, public_location_address: 'Old public venue' })) {
        if (sql.includes(`ce.${column}`)) row[column] = value;
      }
      return [[row]];
    });
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }, next = vi.fn();
    await listHubEvents({ query: { agencyId: 2 }, user: { id: 7, role: 'staff' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].events[0]).toMatchObject({
      eventLocationName: 'Community center', eventLocationAddress: address
    });
  });

  it('loads a legacy public address when no event venue address exists', async () => {
    m.execute.mockImplementation(async sql => sql.includes('FROM company_events ce')
      ? [[{ id: 15, event_type: 'school_outreach', event_location_address: ' ', public_location_address: address }]] : [[]]);
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }, next = vi.fn();
    await listHubEvents({ query: { agencyId: 2 }, user: { id: 7, role: 'staff', agencyId: 2 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].events[0].eventLocationAddress).toBe(address);
  });
});
