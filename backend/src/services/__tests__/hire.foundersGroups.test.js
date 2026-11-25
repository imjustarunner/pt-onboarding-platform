import { beforeEach, expect, it, vi } from 'vitest';
import { FOUNDERS_GROUPS, NEW_FOUNDERS_GROUPS } from '../foundersGroupPolicy.js';

const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: {} }));
vi.mock('../managedWorkspaceGroups.service.js', () => ({ retryNewGroupPropagation: fn => fn() }));

import { provisionFoundersGroups } from '../foundersGroupProvisioning.service.js';
import { managedGroupEnvelope } from '../managedWorkspaceGroupAccess.service.js';

const people = [
  { id: '111', primaryEmail: 'melissa@workspace.test', name: { givenName: 'Melissa', familyName: 'Méndez' } },
  { id: '222', primaryEmail: 'michael@workspace.test', name: { givenName: 'Michael', familyName: 'Mendez' } }
];
const notFound = Object.assign(new Error('Missing'), { code: 404 });
let groups, directory, admin, input;
beforeEach(() => {
  groups = new Map([[FOUNDERS_GROUPS.itsco, new Map()]]);
  admin = {
    groups: { insert: vi.fn(async ({ requestBody }) => groups.set(requestBody.email, new Map())) },
    members: {
      get: vi.fn(async ({ groupKey, memberKey }) => {
        const data = groups.get(groupKey)?.get(memberKey);
        if (!data) throw notFound;
        return { data };
      }),
      insert: vi.fn(async ({ groupKey, requestBody }) => groups.get(groupKey).set(requestBody.email, {
        ...requestBody, id: people.find(person => person.primaryEmail === requestBody.email)?.id, type: 'USER'
      })),
      update: vi.fn(async ({ groupKey, memberKey, requestBody }) => Object.assign(groups.get(groupKey).get(memberKey), requestBody))
    }
  };
  directory = {
    getUser: vi.fn(async ({ primaryEmail }) => people.find(person => person.primaryEmail === primaryEmail)),
    getClient: vi.fn(async () => admin),
    getGroup: vi.fn(async ({ groupEmail }) => groups.has(groupEmail) ? { email: groupEmail } : null),
    listGroupMembers: vi.fn(async groupEmail => [...groups.get(groupEmail)?.values() || []]),
    applyGroupAccessSettings: vi.fn(async () => {})
  };
  m.execute.mockReset().mockImplementation(async (sql, [slug]) => sql.startsWith('SELECT id FROM agencies')
    ? [[{ id: Object.keys(FOUNDERS_GROUPS).indexOf(slug) + 1 }]]
    : [[]]);
  input = { directory, db: { execute: m.execute }, melissa: people[0].primaryEmail, michael: people[1].primaryEmail };
});

it('previews only the requested new groups without changing Workspace or the application registry', async () => {
  expect(await provisionFoundersGroups(input)).toEqual(NEW_FOUNDERS_GROUPS.map(email => ({ email, create: true, ready: false })));
  expect(admin.groups.insert).not.toHaveBeenCalled();
  expect(admin.members.insert).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});

it('registers the existing ITSCO group and creates private two-member groups with verified delivery', async () => {
  expect(await provisionFoundersGroups({ ...input, apply: true })).toEqual(NEW_FOUNDERS_GROUPS.map(email => ({ email, create: true, ready: true })));
  for (const email of NEW_FOUNDERS_GROUPS) {
    expect([...groups.get(email).values()].map(member => member.delivery_settings)).toEqual(['ALL_MAIL', 'ALL_MAIL']);
    expect([...groups.get(email).keys()].sort()).toEqual(people.map(person => person.primaryEmail));
  }
  expect(groups.get(FOUNDERS_GROUPS.itsco).size).toBe(0);
  expect(directory.applyGroupAccessSettings).toHaveBeenCalledWith(expect.objectContaining({
    allowExternalMembers: false, whoCanJoin: 'INVITED_CAN_JOIN', includeInGlobalAddressList: false
  }));
  expect(m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT')).map(([, params]) => params[2]).sort())
    .toEqual(Object.values(FOUNDERS_GROUPS).sort());
  await provisionFoundersGroups({ ...input, apply: true });
  expect(admin.groups.insert).toHaveBeenCalledTimes(3);
  expect(admin.members.insert).toHaveBeenCalledTimes(6);
});

it('stops all changes for an unexpected existing group member or incorrect Workspace identity', async () => {
  groups.set(FOUNDERS_GROUPS.plottwistco, new Map([['other@workspace.test', { type: 'GROUP', email: 'other@workspace.test' }]]));
  await expect(provisionFoundersGroups({ ...input, apply: true })).rejects.toThrow('has other members');
  await expect(provisionFoundersGroups({ ...input, melissa: people[1].primaryEmail, apply: true })).rejects.toThrow('did not verify for Melissa');
  expect(admin.groups.insert).not.toHaveBeenCalled();
  expect(admin.members.insert).not.toHaveBeenCalled();
  expect(directory.applyGroupAccessSettings).not.toHaveBeenCalled();
});

it('retains the verified directory-only group as a blind recipient for Workspace delivery', async () => {
  m.execute.mockResolvedValue([[{
    slug: 'nlu', group_key: 'founders', email: FOUNDERS_GROUPS.nlu, last_synced_at: new Date()
  }]]);
  const result = await managedGroupEnvelope({ to: 'po@nextleveluplcc.com', bcc: FOUNDERS_GROUPS.nlu, actorUserId: 99 });
  expect(result).toEqual({ to: 'po@nextleveluplcc.com', cc: null, bcc: FOUNDERS_GROUPS.nlu });
  expect(m.execute).toHaveBeenCalledTimes(1);
});
