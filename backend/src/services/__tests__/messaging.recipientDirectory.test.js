import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../communicationDirectory.service.js', () => ({}));
vi.mock('../personalMailbox.service.js', () => ({findPersonalInbox:vi.fn(),ensurePersonalMailbox:vi.fn()}));
vi.mock('../secureMessagingPolicy.service.js', () => ({shouldDefaultToSecureMessage:()=>false}));
vi.mock('../unifiedInbox.service.js', () => ({}));
vi.mock('../../controllers/chat.controller.js', () => ({}));
vi.mock('../chatEncryption.service.js', () => ({}));
vi.mock('../hubMessageQueue.service.js', () => ({}));
vi.mock('../../models/AgencyContact.model.js', () => ({default:{create:vi.fn()}}));
import pool from '../../config/database.js';
import { findPersonalInbox,ensurePersonalMailbox } from '../personalMailbox.service.js';
import AgencyContact from '../../models/AgencyContact.model.js';
import { browseHubPeople,ensureHubExternalContact } from '../messagesHub.service.js';
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValue([[]]); findPersonalInbox.mockResolvedValue(null); });
describe('recipient directory scope and responsiveness', () => {
  it.each(['provider','admin'])('searches the full authorized %s client list before limiting results', async viewerRole => {
    await browseHubPeople({agencyId:2,userId:5,browse:'caseload',q:'Jane',viewerRole,limit:40});
    const [sql,params]=pool.execute.mock.calls.find(([sql])=>sql.includes('FROM clients c'));
    expect(sql).toContain('c.agency_id IN (?)');
    expect(sql).toContain('c.full_name LIKE ? OR c.initials LIKE ? OR org.name LIKE ?');
    expect(sql.indexOf('c.full_name LIKE ?')).toBeLessThan(sql.indexOf('LIMIT 40'));
    expect(params).toEqual([2,5,5,5,5,'%Jane%','%Jane%','%Jane%']);
    if(viewerRole==='provider') expect(sql).toContain('hub_assignment.provider_user_id = ?');
    expect(findPersonalInbox).toHaveBeenCalledWith({agencyId:2,userId:5});
    expect(ensurePersonalMailbox).not.toHaveBeenCalled();
  });
  it('shows shared managed email groups and personal contacts with visibility restrictions intact', async () => {
    await browseHubPeople({agencyId:2,userId:5,browse:'contacts',q:'staff'});
    const [sql,params]=pool.execute.mock.calls.find(([sql])=>sql.includes('FROM agency_contacts ac'));
    expect(sql).toContain('ac.share_with_all = 1');
    expect(sql).toContain('hub_contact_assignment.provider_user_id = ?');
    expect(sql).toContain('ac.full_name LIKE ? OR ac.email LIKE ?');
    expect(params).toEqual([2,5,5,5,5,5,5,5,'%staff%','%staff%','%staff%']);
    expect(ensurePersonalMailbox).not.toHaveBeenCalled();
  });
  it.each([{}, {linkUserId:8}, {existingContactId:9}])('rejects inaccessible client associations for all contact paths: %j', async path => {
    await expect(ensureHubExternalContact({agencyId:2,userId:5,email:'new@example.com',clientId:7,...path})).rejects.toMatchObject({status:403});
    expect(AgencyContact.create).not.toHaveBeenCalled();
  });
  it('rejects a client from another agency even for an otherwise authorized admin', async () => {
    await expect(ensureHubExternalContact({agencyId:2,userId:5,role:'admin',email:'new@example.com',clientId:7,linkUserId:8})).rejects.toMatchObject({status:403});
    expect(AgencyContact.create).not.toHaveBeenCalled();
  });
});
