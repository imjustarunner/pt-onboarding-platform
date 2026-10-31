import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), guardian: vi.fn(), email: vi.fn(), buildEmail: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: async () => ({ id: 8, agency_id: 2, initials: 'AB', full_name: 'Alex Brown' }) } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { getLink: mocks.guardian, isNoView: p => !!p?.noView } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, name: 'Agency' }) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => ({ first_name: 'Account', last_name: 'Guardian' }) } }));
vi.mock('../brandedNotificationEmail.service.js', () => ({ buildContactAssignedReminderEmailForAgency: mocks.buildEmail }));
vi.mock('../contactReminderToken.service.js', () => ({ buildContactReminderLinks: () => ({}), publicAppBaseUrl: () => 'https://app.example.test' }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ inferAgencyMailDomain: async () => 'example.test' }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: mocks.email }));
import Contact from '../../models/ClientContactAffiliation.model.js';
import { upsertClientAffiliatedContact, updateClientAffiliatedContact } from '../clientContactAffiliation.service.js';

let db;
beforeEach(() => {
  vi.resetAllMocks();
  db = new DatabaseSync(':memory:');
  // Client identity columns follow migrations 100, 128, and 1652. There are no
  // first_name/last_name columns: executing the former hydrate query fails here.
  db.exec(`CREATE TABLE clients(id INTEGER PRIMARY KEY, initials TEXT, full_name TEXT, preferred_name TEXT);
    INSERT INTO clients VALUES(8,'AB','Alex Brown',NULL);
    CREATE TABLE agency_contacts(id INTEGER PRIMARY KEY, agency_id INTEGER, created_by_user_id INTEGER,
      share_with_all INTEGER, client_id INTEGER, full_name TEXT, email TEXT, email_alt TEXT, phone TEXT,
      source TEXT, source_ref_id INTEGER, relationship_type TEXT, is_active INTEGER, updated_at TEXT);
    CREATE TABLE client_contact_affiliations(id INTEGER PRIMARY KEY, agency_id INTEGER, client_id INTEGER,
      agency_contact_id INTEGER, relationship_type TEXT, email_reminders_enabled INTEGER, sms_reminders_enabled INTEGER,
      sms_opt_in INTEGER, is_active INTEGER, notify_ack_by_user_id INTEGER, notify_ack_at TEXT, created_by_user_id INTEGER,
      notify_email_sent_at TEXT, notify_email_message_id TEXT, contact_last_choice TEXT, contact_choice_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT, UNIQUE(client_id,agency_contact_id));`);
  mocks.execute.mockImplementation(async (sql, params = []) => {
    const statement = db.prepare(sql);
    const values = params.map(p => p instanceof Date ? p.toISOString() : p);
    if (/^\s*SELECT/i.test(sql)) return [statement.all(...values)];
    const result = statement.run(...values);
    return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }];
  });
  mocks.guardian.mockResolvedValue({ access_enabled: 1, permissions_json: {} });
  mocks.email.mockResolvedValue({ messageId: 'sent-test' });
  mocks.buildEmail.mockReturnValue({ subject: 'Reminder preferences', text: 'Minimal reminder notice', html: '<p>Notice</p>' });
});
afterEach(() => db.close());
const input = { agencyId: 2, clientId: 8, userId: 15, fullName: 'Support Contact', phone: '(303) 555-0100', relationshipType: 'other' };
describe('additional contact save against the client identity schema', () => {
  it('saves a staff-entered phone-only contact and returns the saved row without sending a reminder', async () => {
    const saved = await upsertClientAffiliatedContact(input);
    expect(saved).toMatchObject({ clientInitials: 'AB', affiliation: { id: 1, client: { initials: 'AB', fullName: 'Alex Brown' }, contact: { fullName: 'Support Contact', phone: '+13035550100' }, emailRemindersEnabled: false, smsRemindersEnabled: false } });
    expect((await Contact.listForClient(8)).map(Contact.toApi)).toHaveLength(1);
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it('recovers a retry after an earlier save without creating a second contact or affiliation', async () => {
    const first = await upsertClientAffiliatedContact(input);
    const second = await upsertClientAffiliatedContact({ ...input, phone: '+13035550100' });
    expect(second.affiliation.id).toBe(first.affiliation.id);
    expect(db.prepare('SELECT COUNT(*) n FROM agency_contacts').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM client_contact_affiliations').get().n).toBe(1);
  });
  it('supports editing and removing the saved affiliation through the same hydrate path', async () => {
    const { affiliation } = await upsertClientAffiliatedContact(input);
    const updated = await updateClientAffiliatedContact({ affiliationId: affiliation.id, clientId: 8, userId: 15, patch: { relationshipType: 'case_manager' } });
    expect(updated.affiliation.relationshipType).toBe('case_manager');
    await Contact.softDeactivate(affiliation.id);
    expect(await Contact.listForClient(8)).toEqual([]);
  });
  it('retains guardian authorization before enabling reminders', async () => {
    mocks.guardian.mockResolvedValue(null);
    await expect(upsertClientAffiliatedContact({ ...input, smsRemindersEnabled: true, acknowledgeNotify: true })).rejects.toMatchObject({ status: 403 });
    expect(db.prepare('SELECT COUNT(*) n FROM agency_contacts').get().n).toBe(0);
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it('uses client initials for an authorized reminder notice', async () => {
    await upsertClientAffiliatedContact({ ...input, email: 'contact@example.test', emailRemindersEnabled: true, acknowledgeNotify: true });
    expect(mocks.buildEmail).toHaveBeenCalledWith(expect.objectContaining({ clientFirstName: 'AB', clientLastName: '', clientPreferredName: '' }));
    expect(mocks.email).toHaveBeenCalledOnce();
  });
});
