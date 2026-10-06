import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../lifecycleSync.service.js', () => ({ syncLifecycleItems: vi.fn() }));
import { enabledCredentialSystems, getCredentialPacketForPortal, revealPortalTempPassword } from '../onboardingCredentialPacket.service.js';
let info;
beforeEach(() => {
  info = {}; vi.clearAllMocks();
  mocks.execute.mockImplementation(async sql => sql.includes('FROM users') ? [[{ id: 1, status: 'ONBOARDING', work_email: 'devon@agency.org' }]]
    : sql.includes('uifd.field_key, uiv.value') ? [Object.entries(info).map(([field_key, value]) => ({ field_key, value }))] : [[]]);
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
