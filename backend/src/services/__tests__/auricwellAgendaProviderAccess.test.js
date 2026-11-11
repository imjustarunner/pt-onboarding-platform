import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ person: null, rollout: true }));
vi.mock('../../config/database.js', () => ({ onTableWrite: vi.fn(), default: { execute: vi.fn(async sql => {
  if (sql.includes('SELECT u.id,u.first_name')) return [[state.person]];
  if (sql === 'SELECT feature_flags FROM agencies WHERE id = ?') return [[{ feature_flags: { clientSessionBookingRollout: { revision: 1, entries: [{ providerUserId: 19, enabled: state.rollout }] } } }]];
  if (sql.includes('u.sees_clients,u.has_provider_access')) return [[state.person]];
  if (sql.includes('SELECT DISTINCT c.id')) return [[]];
  throw new Error(`Unexpected synthetic provider eligibility query: ${sql.slice(0, 70)}`);
} ) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, timezone: 'America/Denver' })) } }));
vi.mock('../../models/AgencyServiceLocation.model.js', () => ({ default: { listByAgency: vi.fn(async () => []) } }));
vi.mock('../appointment.service.js', () => ({ resolveBookingOptions: vi.fn(async () => ({ services: [] })) }));
import { createAuricwellAgendaImporter } from '../auricwellAgendaImport.service.js';

const actor = { id: 7, role: 'super_admin' };
const options = () => createAuricwellAgendaImporter().options({ actor, agencyId: 2, providerId: 19 });
beforeEach(() => {
  state.rollout = true;
  state.person = { id: 19, first_name: 'DEMO', last_name: 'Dual role', role: 'admin', credential: 'LPC', status: 'ACTIVE_EMPLOYEE', is_active: 1, is_archived: 0,
    membership_active: 1, sees_clients: 1, has_provider_access: 1, agency_role: null, public_details_json: null };
});

describe('agenda uses the canonical care and booking eligibility gates', () => {
  it('accepts active dual-role administrators who see clients and have booking enabled', async () => {
    await expect(options()).resolves.toMatchObject({ agencyId: 2, providerId: 19 });
  });
  it('accepts a selected employee with explicit provider access and enabled client care', async () => {
    state.person.role = 'employee';
    await expect(options()).resolves.toMatchObject({ providerId: 19 });
  });
  it.each([
    ['booking is disabled', () => { state.rollout = false; }],
    ['Sees clients is off', () => { state.person.sees_clients = 0; }],
    ['membership is inactive', () => { state.person.membership_active = 0; }],
    ['tenant role excludes client care', () => { state.person.agency_role = 'support'; }],
    ['staff has no care role or provider access', () => { state.person.role = 'employee'; state.person.has_provider_access = 0; }]
  ])('does not grant access when %s', async (_label, change) => {
    change();
    await expect(options()).rejects.toMatchObject({ status: 403 });
  });
});
