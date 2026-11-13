import { expect, it } from 'vitest';
import { taskTeamOrganizations } from '../taskOrganizationScope';

it('keeps full task tenants without requesting nested portals or SCB partner companies', () => {
  const organizations = [
    { id: 450, name: 'QA agency', organization_type: 'agency' },
    { id: 451, name: 'QA school', organization_type: 'school', affiliated_agency_id: 450 },
    { id: 456, name: 'SCB company', organization_type: 'agency', feature_flags: JSON.stringify({ schoolCareBridgeOnly: true }) },
    { id: 457, organization_type: 'consultant' },
    { id: 458, organization_type: 'learning' },
    { id: 450, organization_type: 'agency' }
  ];
  const before = JSON.stringify(organizations);
  expect(taskTeamOrganizations(organizations).map(org => org.id)).toEqual([450, 457]);
  expect(JSON.stringify(organizations)).toBe(before);
});

it('does not restore a restricted current tenant as an empty-list fallback', () => {
  expect(taskTeamOrganizations([{ id: 456, feature_flags: { schoolCareBridgeOnly: true } }])).toEqual([]);
  expect(taskTeamOrganizations(null)).toEqual([]);
  expect(taskTeamOrganizations([{ agency_id: 450, name: 'Legacy agency' }])).toHaveLength(1);
});
