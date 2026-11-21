import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { fillAgencyProviderContactEmails } from '../schoolProviderContact.service.js';

let database;
const provider = () => ({ provider_user_id: 7, email: 'clinician@platform.example', work_email: 'clinician@another-agency.example' });
beforeEach(() => { database = { execute: vi.fn(async () => [[]]) }; });

it('uses the saved parent-agency mailbox instead of the global account email', async () => {
  database.execute.mockImplementation(async sql => sql.includes('FROM email_sender_identities')
    ? [[{ identity_key: 'personal_7', from_email: 'Clinician@School-Agency.example' }]]
    : [[{ user_id: 7, email: 'older@school-agency.example' }]]);
  const result = await fillAgencyProviderContactEmails([provider()], 2, database);
  expect(result[0].email).toBe('clinician@school-agency.example');
  expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id = ? AND is_active = TRUE'), [2, 'personal_7']);
});

it('uses an agency login alias when no personal mailbox is configured', async () => {
  database.execute.mockImplementation(async sql => sql.includes('FROM user_login_emails')
    ? [[{ user_id: 7, email: 'clinician@school-agency.example' }]] : [[]]);
  expect((await fillAgencyProviderContactEmails([provider()], 2, database))[0].email).toBe('clinician@school-agency.example');
});

it('resolves the same clinician independently for each agency and never uses another clinician’s address', async () => {
  database.execute.mockImplementation(async (sql, values) => sql.includes('FROM email_sender_identities')
    ? [[{ identity_key: 'personal_7', from_email: `clinician@agency${values[0]}.example` }, { identity_key: 'personal_9', from_email: 'other@agency.example' }]] : [[]]);
  expect((await fillAgencyProviderContactEmails([provider()], 2, database))[0].email).toBe('clinician@agency2.example');
  expect((await fillAgencyProviderContactEmails([provider()], 6, database))[0].email).toBe('clinician@agency6.example');
  expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('FROM user_login_emails'), [6, 7]);
});

it('preserves legacy contact fallback without guessing a new mailbox address', async () => {
  expect((await fillAgencyProviderContactEmails([provider()], 2, database))[0].email).toBe('clinician@platform.example');
  expect((await fillAgencyProviderContactEmails([{ ...provider(), work_email: null }], 2, database))[0].email).toBe('clinician@platform.example');
});

it('ignores invalid aliases and tolerates missing optional identity tables', async () => {
  database.execute.mockRejectedValue(Object.assign(new Error('Missing table'), { code: 'ER_NO_SUCH_TABLE' }));
  expect((await fillAgencyProviderContactEmails([provider()], 2, database))[0].email).toBe('clinician@platform.example');
  database.execute.mockImplementation(async () => [[{ user_id: 7, email: 'invalid\naddress' }]]);
  expect((await fillAgencyProviderContactEmails([provider()], 2, database))[0].email).toBe('clinician@platform.example');
});

it('surfaces actual storage errors and skips lookups when there is no agency or provider', async () => {
  await fillAgencyProviderContactEmails([], 2, database);
  await fillAgencyProviderContactEmails([provider()], null, database);
  expect(database.execute).not.toHaveBeenCalled();
  database.execute.mockRejectedValue(new Error('Database unavailable'));
  await expect(fillAgencyProviderContactEmails([provider()], 2, database)).rejects.toThrow('Database unavailable');
});
