import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../lifecycleSync.service.js', () => ({ syncLifecycleItems: vi.fn() }));
import { enabledCredentialSystems, getCredentialPacketForPortal, revealPortalTempPassword, acknowledgePortalAccounts } from '../onboardingCredentialPacket.service.js';
let info, status;
beforeEach(() => {
  info = {}; status = 'ONBOARDING'; vi.clearAllMocks();
  mocks.execute.mockImplementation(async (sql, params) => sql.includes('FROM users') ? [[{ id: 1, status, work_email: 'devon@agency.org' }]]
    : sql.includes('uifd.field_key, uiv.value') ? [Object.entries(info).map(([field_key, value]) => ({ field_key, value }))] : sql.includes('SELECT id FROM user_info_field_definitions') ? [[{ id: params[0] }]] : sql.includes('INSERT INTO user_info_values') ? (info[params[1]] = params[2], [{}]) : [[]]);
});
describe('onboarding account access', () => {
  it('does not require Workspace or TherapyNotes for a new employee', async () => {
    expect(enabledCredentialSystems({})).toEqual({ workspaceEnabled: false, therapynotesEnabled: false });
    const packet = await getCredentialPacketForPortal(1);
    expect(packet.systems.map(s => s.key)).toEqual(['email', 'grasshopper']);
    expect(packet.systems[0]).toMatchObject({ label: 'Platform work address', hasTempPassword: false });
  });
  it('preserves legacy accounts unless explicitly disabled', async () => {
    info = { workspace_temp_password: 'legacy', therapynotes_login: 'devon', therapynotes_temp_password: 'legacy' };
    expect(enabledCredentialSystems(info)).toEqual({ workspaceEnabled: true, therapynotesEnabled: true });
    info.workspace_access_enabled = '0'; info.therapynotes_access_enabled = '0';
    const packet = await getCredentialPacketForPortal(1);
    expect(packet.systems.map(s => s.key)).not.toContain('therapynotes');
    expect(packet.systems[0].tempPasswordAvailable).toBe(false);
    await expect(revealPortalTempPassword(1, 'workspace')).resolves.toEqual({ revealed: false, reason: 'not_enabled', password: null });
    await expect(revealPortalTempPassword(1, 'therapynotes')).resolves.toEqual({ revealed: false, reason: 'not_enabled', password: null });
  });
  it('delivers Grasshopper details and enabled TherapyNotes without passwords in the packet', async () => {
    info = { therapynotes_access_enabled: '1', therapynotes_login: 'devon', therapynotes_temp_password: 'private', grasshopper_login: 'devon', grasshopper_extension: '102', grasshopper_pin: '1234' };
    const packet = await getCredentialPacketForPortal(1);
    expect(packet.systems.find(s => s.key === 'grasshopper')).toMatchObject({ username: 'devon', extension: '102', pin: '1234' });
    expect(packet.systems.find(s => s.key === 'therapynotes')).toMatchObject({ username: 'devon', tempPasswordAvailable: true });
    expect(JSON.stringify(packet)).not.toContain('private');
  });
});

it('retains enabled system details for the activated employee dashboard', async () => {
  status = 'ACTIVE_EMPLOYEE'; info = { grasshopper_login: 'devon', grasshopper_pin: '1234', therapynotes_login: 'devon.tn', therapynotes_temp_password: 'secret', therapynotes_temp_password_revealed: '2026-10-06' };
  const packet = await getCredentialPacketForPortal(1, { employeeAccount: true });
  expect(packet.systems.map(s => s.key)).toEqual(['email', 'grasshopper', 'therapynotes']);
  expect(packet.systems[2]).toMatchObject({ username: 'devon.tn', tempPasswordAvailable: true, tempPasswordConsumed: false });
  expect(JSON.stringify(packet)).not.toContain('secret');
  await expect(revealPortalTempPassword(1, 'therapynotes')).resolves.toMatchObject({ revealed: true, password: 'secret' });
});
it('acknowledges the whole page once and preserves the details for return visits', async () => {
  info = { grasshopper_login: 'devon', grasshopper_pin: '1234', therapynotes_login: 'devon.tn' };
  const packet = await acknowledgePortalAccounts(1);
  expect(packet.systems.every(s => s.acknowledged)).toBe(true);
  const reloaded = await getCredentialPacketForPortal(1);
  expect(reloaded.systems.find(s => s.key === 'grasshopper')).toMatchObject({ username: 'devon', pin: '1234', acknowledged: true });
});

it.each(['workspace', 'therapynotes'])('allows repeated views of an existing %s password, including previously revealed passwords', async (system) => {
  info = { [`${system}_access_enabled`]: '1', [`${system}_temp_password`]: 'saved-example', [`${system}_temp_password_revealed`]: '2026-10-06' };
  for (let visit = 0; visit < 2; visit++) {
    await expect(revealPortalTempPassword(1, system)).resolves.toEqual({ revealed: true, password: 'saved-example' });
    const packet = await getCredentialPacketForPortal(1, { employeeAccount: true });
    expect(packet.systems.find(s => s.key === (system === 'workspace' ? 'email' : system)).tempPasswordAvailable).toBe(true);
    expect(JSON.stringify(packet)).not.toContain('saved-example');
  }
});
it('returns the current saved password and stops showing it if staff removes it', async () => {
  info = { therapynotes_access_enabled: '1', therapynotes_temp_password: 'updated-example', therapynotes_temp_password_revealed: 'earlier' };
  await expect(revealPortalTempPassword(1, 'therapynotes')).resolves.toMatchObject({ password: 'updated-example' });
  delete info.therapynotes_temp_password;
  await expect(revealPortalTempPassword(1, 'therapynotes')).resolves.toMatchObject({ revealed: false, reason: 'not_set', password: null });
});
