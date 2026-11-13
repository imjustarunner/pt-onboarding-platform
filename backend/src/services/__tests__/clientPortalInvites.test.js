import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
vi.mock('../clientPortalContext.service.js', () => ({ resolveClientPortalContext: vi.fn() }));
vi.mock('../coGuardianDelivery.service.js', () => ({previewStaffGuardianRetries:vi.fn(),sendStaffSelectedGuardianRetry:vi.fn()}));
vi.mock('../messagesHub.service.js', () => ({ sendHubPortalInvitation: vi.fn() }));
import {previewStaffGuardianRetries,sendStaffSelectedGuardianRetry} from '../coGuardianDelivery.service.js';
import { resolveClientPortalContext } from '../clientPortalContext.service.js';
import Client from '../../models/Client.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { resolveClientRecordAccess } from '../clientRecordAccess.service.js';
import { sendHubPortalInvitation } from '../messagesHub.service.js';
import { previewClientPortalInvites, sendClientPortalInvite } from '../clientPortalInvites.service.js';
const actor = { id: 5, role: 'provider' };
const sendCurrent=async(args)=>{const preview=await previewClientPortalInvites(args);return sendClientPortalInvite({...args,recipientSnapshot:preview.recipients.find(r=>r.key===args.recipientKey)?.snapshot});};
const contact = { guardian_user_id: 10, role: 'client_guardian', access_enabled: 1, email: 'parent@example.com', first_name: 'Parent', status: 'PENDING_SETUP' };
beforeEach(() => {
  vi.resetAllMocks();
  previewStaffGuardianRetries.mockResolvedValue({recipients:[],pendingEmails:[],skipped:[]});
  resolveClientPortalContext.mockResolvedValue({ tenant: { id: 2 }, portal: { id: 2, name: 'Tenant' }, learning: false });
  resolveClientRecordAccess.mockResolvedValue({ ok: true });
  Client.findById.mockImplementation(async id => ({ id, agency_id: 2, initials: `C${id}`, status: 'ACTIVE' }));
  ClientGuardian.listForClient.mockResolvedValue([contact]);
  sendHubPortalInvitation.mockResolvedValue({ delivery: { id: 'email-1' } });
});
describe('client portal invitation selection', () => {
  it('includes two separately linked guardians and sends only the staff-selected account', async () => {
    ClientGuardian.listForClient.mockResolvedValue([contact, { ...contact, guardian_user_id: 11, email: 'second@example.com' }]);
    const result = await previewClientPortalInvites({ actor, clientIds: [1, 2] });
    expect(result.recipients.map(r => r.key)).toEqual(['2:10', '2:11']);
    expect(result.recipients.every(r => r.clients.length === 2)).toBe(true);
    await sendCurrent({ actor, clientIds: [1, 2], recipientKey: '2:11' });
    expect(sendHubPortalInvitation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ guardianUserId: 11, existingLinkOnly: true }));
  });
  it('deduplicates shared accounts and repeated client IDs without sending on preview', async () => {
    const result = await previewClientPortalInvites({ actor, clientIds: [1, 2, 1] });
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0].clients.map(c => c.clientId)).toEqual([1, 2]);
    expect(sendHubPortalInvitation).not.toHaveBeenCalled();
    expect(Client.update).not.toHaveBeenCalled();
  });
  it('rejects unauthorized clients before sending or enabling portal access', async () => {
    resolveClientRecordAccess.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    await expect(sendClientPortalInvite({ actor, clientIds: [1, 2], recipientKey: '2:10' })).rejects.toMatchObject({ status: 403 });
    expect(sendHubPortalInvitation).not.toHaveBeenCalled(); expect(Client.update).not.toHaveBeenCalled();
  });
  it('never invites disabled, staff, suspended, or missing-email contacts', async () => {
    ClientGuardian.listForClient.mockResolvedValue([
      { ...contact, access_enabled: 0 }, { ...contact, role: 'admin' }, { ...contact, status: 'SUSPENDED' }, { ...contact, email: null }
    ]);
    const result = await previewClientPortalInvites({ actor, clientIds: [1] });
    expect(result.recipients).toEqual([]); expect(result.skipped).toHaveLength(1);
  });
  it('revalidates recipient selection and sends one invitation for siblings', async () => {
    await expect(sendClientPortalInvite({ actor, clientIds: [1], recipientKey: '9:10' })).rejects.toMatchObject({ status: 409 });
    await sendCurrent({ actor, clientIds: [1, 2], recipientKey: '2:10' });
    expect(sendHubPortalInvitation).toHaveBeenCalledTimes(1);
    expect(sendHubPortalInvitation).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, guardianUserId: 10, existingLinkOnly: true }));
    expect(Client.update).toHaveBeenCalledTimes(2);
  });
  it('reports blocked, queued and redirected email without claiming it was sent', async () => {
    for (const [delivery, status] of [[{ skipped: true }, 'skipped'], [{ pendingApproval: true }, 'queued'], [{ redirected: true, id: 'test-1' }, 'redirected'], [{}, 'unconfirmed'], [{ id: 'email-1' }, 'sent']]) {
      sendHubPortalInvitation.mockResolvedValue({ delivery });
      expect(await sendCurrent({ actor, clientIds: [1], recipientKey: '2:10' })).toMatchObject({ status });
    }
  });
  it('keeps tutoring and care invitations separate for a shared family account', async () => {
    resolveClientPortalContext.mockResolvedValueOnce({ tenant: { id: 2 }, portal: { id: 2 }, learning: false })
      .mockResolvedValueOnce({ tenant: { id: 2 }, portal: { id: 3 }, learning: true });
    const result = await previewClientPortalInvites({ actor, clientIds: [1, 2] });
    expect(result.recipients.map(r => r.key)).toEqual(['2:10', '2:10:learning:3']);
  });
  it('rejects non-staff actors, invalid and oversized selections', async () => {
    await expect(previewClientPortalInvites({ actor: { id: 10, role: 'client' }, clientIds: [1] })).rejects.toMatchObject({ status: 403 });
    for (const clientIds of [[], [1.5], ['bad'], Array(201).fill(1)]) await expect(previewClientPortalInvites({ actor, clientIds })).rejects.toMatchObject({ status: 400 });
  });
});

it('does not send generic setup to a restricted own-enrollment contact',async()=>{
 ClientGuardian.listForClient.mockResolvedValue([{...contact,permissions_json:{noView:true,noViewOtherGuardian:true}}]);
 const own={key:'2:own-enrollment:35',kind:'own_enrollment',agencyId:2,invitationId:35,email:contact.email,clients:[{clientId:1,label:'C1'}],snapshot:'recorded-failure'};
 previewStaffGuardianRetries.mockResolvedValue({recipients:[own],pendingEmails:[contact.email],skipped:[]});
 const preview=await previewClientPortalInvites({actor,clientIds:[1]});expect(preview.recipients).toEqual([own]);
 sendStaffSelectedGuardianRetry.mockResolvedValue({invitationId:35,deliveryStatus:'sent',deliveryAttemptId:27,communicationId:100,redirected:true});
 expect(await sendClientPortalInvite({actor,clientIds:[1],recipientKey:own.key,recipientSnapshot:own.snapshot})).toEqual({key:own.key,status:'redirected',invitationId:35,deliveryAttemptId:27,communicationId:100});
 expect(sendStaffSelectedGuardianRetry).toHaveBeenCalledWith({actorUserId:5,agencyId:2,inviteId:35,clientIds:[1],snapshot:own.snapshot});
 expect(sendHubPortalInvitation).not.toHaveBeenCalled();expect(Client.update).not.toHaveBeenCalled();
});
it.each([{email:'changed@example.test'},{permissions_json:{noView:true}},{access_enabled:0},{permissions_json:'{'},{permissions_json:[]}])('rejects changed recipient/access after preview %j',async change=>{
 const preview=await previewClientPortalInvites({actor,clientIds:[1]});
 ClientGuardian.listForClient.mockResolvedValue([{...contact,...change}]);
 await expect(sendClientPortalInvite({actor,clientIds:[1],recipientKey:'2:10',recipientSnapshot:preview.recipients[0].snapshot})).rejects.toMatchObject({status:409,code:'PORTAL_INVITATION_PREVIEW_CHANGED'});
 expect(sendHubPortalInvitation).not.toHaveBeenCalled();expect(Client.update).not.toHaveBeenCalled();
});
it('refuses an old own invitation preview after a successful/pending delivery',async()=>{
 const own={key:'2:own-enrollment:35',kind:'own_enrollment',agencyId:2,invitationId:35,email:contact.email,clients:[{clientId:1,label:'C1'}],snapshot:'old'};
 previewStaffGuardianRetries.mockResolvedValue({recipients:[],pendingEmails:[contact.email],skipped:[]});
 await expect(sendClientPortalInvite({actor,clientIds:[1],recipientKey:own.key,recipientSnapshot:own.snapshot})).rejects.toMatchObject({status:409,code:'PORTAL_INVITATION_PREVIEW_CHANGED'});
 expect(sendStaffSelectedGuardianRetry).not.toHaveBeenCalled();expect(sendHubPortalInvitation).not.toHaveBeenCalled();
});
it('binds generic selection to exact clients and forwards authoritative email and children to transport',async()=>{
 const preview=await previewClientPortalInvites({actor,clientIds:[1,2]});
 await expect(sendClientPortalInvite({actor,clientIds:[1],recipientKey:'2:10',recipientSnapshot:preview.recipients[0].snapshot})).rejects.toHaveProperty('status',409);
 await sendClientPortalInvite({actor,clientIds:[1,2],recipientKey:'2:10',recipientSnapshot:preview.recipients[0].snapshot});
 expect(sendHubPortalInvitation).toHaveBeenCalledWith(expect.objectContaining({expectedRecipientEmail:contact.email,selectedClientIds:[1,2]}));
});
