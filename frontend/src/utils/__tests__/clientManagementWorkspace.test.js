import { beforeEach, expect, it } from 'vitest';
import { reactive } from 'vue';
import { clientManagementWorkspaceKey, rememberClientManagementWorkspace, readClientManagementWorkspace, clearClientManagementWorkspaces, isActiveClientManagementProvider } from '../clientManagementWorkspace.js';

beforeEach(clearClientManagementWorkspaces);
it('restores filters, selections and records from memory without sharing sessions or agencies', () => {
  const context = { userId: 4, role: 'support', sessionId: 'synthetic-session', agencyId: 2, path: '/itsco/admin/clients' };
  const key = clientManagementWorkspaceKey(context);
  const snapshot = reactive({ state: { providerFilter: '8', clients: [{ id: 1, initials: 'SE' }] }, selectedIds: [1] });
  rememberClientManagementWorkspace(key, snapshot, 1000);
  snapshot.state.clients[0].initials = 'changed';
  expect(readClientManagementWorkspace(key, 2000)).toEqual({ state: { providerFilter: '8', clients: [{ id: 1, initials: 'SE' }] }, selectedIds: [1] });
  for (const change of [{userId:5}, {role:'provider'}, {sessionId:'other'}, {agencyId:3}, {path:'/admin/clients'}]) {
    expect(readClientManagementWorkspace(clientManagementWorkspaceKey({...context,...change}),2000)).toBeNull();
  }
  const restored = readClientManagementWorkspace(key,2000);restored.state.clients[0].initials='changed';
  expect(readClientManagementWorkspace(key,2000).state.clients[0].initials).toBe('SE');
  expect(readClientManagementWorkspace(key,301000)).toBeNull();
});
it('shows active providers and explicitly enabled clinicians while excluding demo, staff and inactive records', () => {
  const provider = { role:'provider', is_active:1, status:'ACTIVE', membership_active:1, sees_clients:1 };
  expect(isActiveClientManagementProvider(provider)).toBe(true);
  expect(isActiveClientManagementProvider({...provider,role:'admin',has_provider_access:1})).toBe(true);
  for (const change of [{role:'employee'},{role:'admin'},{role:'super_admin'},{is_active:'0'},{membership_active:0},{is_archived:1},{is_demo:1},{sees_clients:0},{status:'SUSPENDED'},{status:'TERMINATED'}]) {
    expect(isActiveClientManagementProvider({...provider,...change})).toBe(false);
  }
});
