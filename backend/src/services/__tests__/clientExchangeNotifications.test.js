import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), profile: vi.fn(), facets: vi.fn(), send: vi.fn(), notify: vi.fn(), enabled: vi.fn(), identities: vi.fn(), dispatch: vi.fn(), accepted: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn().mockResolvedValue({ id: 2, slug: 'itsco' }) } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: mocks.notify } }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: { getForProvider: mocks.profile } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { list: mocks.identities } }));
vi.mock('../providerClinicalFacets.service.js', () => ({ listClinicalFacetsForUsers: mocks.facets }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: mocks.send }));
vi.mock('../notificationPreferences.service.js', () => ({ isNotificationChannelEnabled: mocks.enabled }));
vi.mock('../notificationDispatcher.service.js', () => ({ default: { dispatchForNotification: mocks.dispatch } }));
vi.mock('../providerAcceptedInsurance.service.js', () => ({ listProviderAcceptedInsurancesForDisplay: mocks.accepted }));
vi.mock('../clientExchangeAudit.service.js',()=>({
  withExchangeLock:vi.fn((id,fn)=>fn()),startExchangeRun:vi.fn(),finishExchangeRun:vi.fn(),saveExchangeDecision:vi.fn(),saveExchangeDelivery:vi.fn(),
  exchangeDeliveryHistory:vi.fn().mockResolvedValue(new Map()),isExchangeListingOpen:vi.fn().mockResolvedValue(true),terminalDelivery:value=>['sent','delivered','queued','sending','unknown'].includes(value?.status),
  enrollExchangeAuditClient:vi.fn(),parseAuditJson:value=>value||{}
}));
vi.mock('../clientExchangeAuditReport.service.js',()=>({sendExchangeAuditReport:vi.fn().mockResolvedValue({status:'sent'})}));
import {exchangeDeliveryHistory,isExchangeListingOpen,saveExchangeDecision,saveExchangeDelivery} from '../clientExchangeAudit.service.js';
import { notifyExchangeMatches, notifyExchangeClaim, notifyExchangeAssignment } from '../clientExchangeNotifications.service.js';
import Agency from '../../models/Agency.model.js';
import {sendExchangeAuditReport} from '../clientExchangeAuditReport.service.js';
const listing = { id: 44, agencyId: 2, currentProviderUserId: 9, postedByUserId: 9, demographics: { ageBand: '9' }, preferences: { modality: 'virtual' } };
beforeEach(() => {
  vi.clearAllMocks();
  Agency.findById.mockResolvedValue({id:2,slug:'itsco'});
  exchangeDeliveryHistory.mockResolvedValue(new Map());
  isExchangeListingOpen.mockResolvedValue(true);
  mocks.execute.mockImplementation(async sql => sql.includes('provider_insurance_overrides') ? [[]] : [[9, 10, 11].map(id => ({ id, role: 'provider', email: `user${id}@example.com`, sees_clients: 1, provider_accepting_new_clients: 1 }))]);
  mocks.accepted.mockResolvedValue({accepted:[],known:false,excluded:[]}); mocks.dispatch.mockResolvedValue({dispatched:false});
  mocks.profile.mockResolvedValue({ details: { virtualEnabled: true } });
  mocks.facets.mockResolvedValue(new Map([[10, { ageGroups: ['Children (6-10)'] }], [11, { ageGroups: ['Adults (18+)'] }]]));
  mocks.enabled.mockResolvedValue(true);
  mocks.identities.mockResolvedValue([{ id: 77, identity_key: 'notifications', from_email: 'notifications@itsco.health',reply_to:'support@itsco.health' },{id:78,identity_key:'noreply',from_email:'noreply@itsco.health'}]);
  mocks.notify.mockResolvedValue({ id: 1 }); mocks.send.mockResolvedValue({ sent: true });
});
it('QA suppresses all match channels for everyone except the configured synthetic provider', async()=>{
  Agency.findById.mockResolvedValue({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviderUserId:10}}});
  mocks.execute.mockResolvedValue([[{id:10,role:'provider',email:'qa.provider.auricwell@example.com',is_demo:1,sees_clients:1,provider_accepting_new_clients:1},{id:11,role:'provider',email:'real@example.org',is_demo:0}]]);
  await notifyExchangeMatches({listing:{...listing,agencyId:450}});
  expect(mocks.notify.mock.calls.map(([n])=>n.userId)).toEqual([10]);
  expect(mocks.send.mock.calls.map(([n])=>n.userId)).toEqual([10]);
  expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  expect(sendExchangeAuditReport).not.toHaveBeenCalled();
});
it('QA claim reviewers receive no in-app or email notification',async()=>{
  Agency.findById.mockResolvedValue({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviderUserId:10}}});
  mocks.execute.mockImplementation(async(sql,params)=>sql.includes('SELECT DISTINCT u.id')?[[{id:12}]]:[[{id:params[1],role:'support',email:'qa.support.auricwell@example.com',is_demo:1}]]);
  await notifyExchangeClaim({listing:{id:44,agency_id:450,current_provider_user_id:9,posted_by_user_id:12},requestingProviderUserId:10});
  expect(mocks.notify).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('QA assignment notification fails closed when the recipient is not its demo provider',async()=>{
  Agency.findById.mockResolvedValue({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviderUserId:10}}});
  mocks.execute.mockResolvedValue([[{id:11,email:'real@example.org',is_demo:0}]]);
  await notifyExchangeAssignment({listing:{id:44,agency_id:450},request:{requesting_provider_user_id:11},actingUserId:12});
  expect(mocks.notify).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('sends to every matched provider except current provider, with an agency-scoped private link', async () => {
  const result = await notifyExchangeMatches({ listing, client: { full_name: 'Private Client Name' } });
  expect(result).toEqual({ matched: 1, sent: 1, queued: 0, skipped: 0, failed: 0 });
  expect(mocks.execute.mock.calls[0][1]).toEqual([2]);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 77, to: 'user10@example.com', templateType: 'client_exchange_match', linkUrl: 'https://app.itsco.health/client-exchange?listingId=44&agencyId=2' }));
  expect(JSON.stringify(mocks.send.mock.calls)).not.toContain('Private Client Name');
  const email = mocks.send.mock.calls[0][0];
  expect(email.text).toContain('Update my availability: https://app.itsco.health/dashboard?tab=my&my=availability');
  expect(email.html).toContain('href="https://app.itsco.health/dashboard?tab=my&amp;my=availability"');
  expect(email.text).toContain('turn off “Accepting new clients,” and select “Save availability.”');
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, agencyId: 2, relatedEntityId: 44 }));
});
it('preserves in-app notification when the recipient opts out of email', async () => {
  mocks.enabled.mockResolvedValue(false);
  const result = await notifyExchangeMatches({ listing });
  expect(mocks.dispatch).toHaveBeenCalledTimes(1); expect(result.skipped).toBe(1); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.notify).toHaveBeenCalledTimes(1);
});
it('reports missing sender and held mail rather than claiming delivery', async () => {
  mocks.identities.mockResolvedValue([]);
  expect((await notifyExchangeMatches({ listing })).failed).toBe(1);
  mocks.identities.mockResolvedValue([{ id: 77, identity_key: 'notifications', from_email:'notifications@itsco.health',reply_to:'support@itsco.health' }]);
  mocks.send.mockResolvedValue({ queued: true });
  const result = await notifyExchangeMatches({ listing }); expect(result.queued).toBe(1); expect(result.sent).toBe(0);
});
it('continues to other matches after one failed email', async () => {
  mocks.facets.mockResolvedValue(new Map([10, 11].map(id => [id, { ageGroups: ['Children (6-10)'] }])));
  mocks.send.mockRejectedValueOnce(new Error('Mail transport unavailable')).mockResolvedValueOnce({ sent: true });
  const result = await notifyExchangeMatches({ listing }); expect(result.failed).toBe(1); expect(result.sent).toBe(1);
});

it('notifies support and outgoing provider on claims without notifying the requesting provider', async () => {
  mocks.execute.mockImplementation(async (sql, params) => sql.includes('SELECT DISTINCT u.id')
    ? [[{ id: 12 }, { id: 10 }]] : [[{ id: params[1], role: 'support', email: `user${params[1]}@example.com` }]]);
  await notifyExchangeClaim({ listing: { id: 44, agency_id: 2, current_provider_user_id: 9, posted_by_user_id: 9 }, requestingProviderUserId: 10 });
  expect(mocks.notify.mock.calls.map(([arg]) => arg.userId).sort()).toEqual([12, 9].sort());
  expect(mocks.send).toHaveBeenCalledTimes(2);
});
it('sends assignment confirmation to the requesting provider in both channels', async () => {
  mocks.execute.mockResolvedValue([[{ id: 10, role: 'provider', work_email: 'provider@example.com' }]]);
  await notifyExchangeAssignment({ listing: { id: 44, agency_id: 2 }, request: { requesting_provider_user_id: 10 }, actingUserId: 12 });
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, type: 'client_exchange_assigned' }));
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'provider@example.com', templateType: 'client_exchange_assigned' }));
});

it('does not bypass matching for a directly addressed referral', async () => {
  await notifyExchangeMatches({ listing: { ...listing, targetProviderUserId: 11 } });
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it('sends a direct referral only to its matching recipient', async () => {
  await notifyExchangeMatches({ listing: { ...listing, targetProviderUserId: 10 } });
  expect(mocks.notify).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 10 }));
});
it('clearly identifies available clients instead of calling them unread messages', async () => {
  await notifyExchangeMatches({ listing });
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
    subject: 'New client added to the exchange',
    replyToOverride:'noreply@itsco.health',
    text: expect.stringContaining('possible match'),
    html: expect.stringContaining('Review and request')
  }));
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({title: 'New client added to the exchange'}));
});
it.each([false, true])('excludes closed scheduling, including directed referrals (%s)', async direct => {
  mocks.profile.mockResolvedValue({agencyAvailability:{seesClients:true, acceptingNewClients:false, virtual:true, inPerson:true}});
  await notifyExchangeMatches({listing:{...listing, targetProviderUserId:direct?10:null}});
  expect(mocks.notify).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('only notifies providers offering the requested visit format', async () => {
  mocks.profile.mockResolvedValue({agencyAvailability:{seesClients:true, acceptingNewClients:true, virtual:false, inPerson:true}});
  await notifyExchangeMatches({listing});
  expect(mocks.send).not.toHaveBeenCalled();
  await notifyExchangeMatches({listing:{...listing, preferences:{modality:'in_person'}}});
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('records all nonmatches with reasons and keeps unknown fields distinct',async()=>{
  await notifyExchangeMatches({listing});
  expect(saveExchangeDecision).toHaveBeenCalledWith(44,11,expect.objectContaining({matched:false,checks:expect.arrayContaining([expect.objectContaining({field:'age',status:'fail'})])}));
  expect(saveExchangeDecision).toHaveBeenCalledWith(44,9,expect.objectContaining({matched:false,checks:expect.arrayContaining([expect.objectContaining({field:'assigned'})])}));
});
it('does not resend existing successful email or text receipts',async()=>{
  exchangeDeliveryHistory.mockResolvedValue(new Map([[10,{notificationId:9,email:{status:'sent',communicationId:2},sms:{status:'sent'}}]]));
  await notifyExchangeMatches({listing});
  expect(mocks.send).not.toHaveBeenCalled();expect(mocks.dispatch).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();
});
it('records SMS opt-out independently from successful email',async()=>{
  mocks.dispatch.mockResolvedValue({dispatched:false,reason:'exchange_sms_not_consented'});
  await notifyExchangeMatches({listing});
  expect(saveExchangeDelivery).toHaveBeenCalledWith(44,10,{sms:expect.objectContaining({status:'skipped',reason:'exchange_sms_not_consented'})});
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
it('does not count redirected or missing transport responses as sent',async()=>{
  mocks.send.mockResolvedValue({redirected:true,id:'test'});
  expect((await notifyExchangeMatches({listing})).sent).toBe(0);
  mocks.send.mockResolvedValue({});expect((await notifyExchangeMatches({listing})).sent).toBe(0);
});
it('audit-only evaluation does not send messages',async()=>{
  await notifyExchangeMatches({listing,send:false,report:false});
  expect(saveExchangeDecision).toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();
});
it('uses the configured Exchange group and its actual reply mailbox',async()=>{
  mocks.identities.mockResolvedValue([{id:80,identity_key:'client_exchange',from_email:'clientexchange@auricwell.com',reply_to:'no-reply@auricwell.com'}]);
  await notifyExchangeMatches({listing});
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:80,replyToOverride:'no-reply@auricwell.com'}));
});

it('does not send when the client is assigned or the listing closes during evaluation',async()=>{
  isExchangeListingOpen.mockResolvedValue(false);await notifyExchangeMatches({listing});expect(mocks.send).not.toHaveBeenCalled();expect(mocks.dispatch).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();
});

it('does not notify demo, archived, inactive or departing providers in a live agency', async () => {
  mocks.execute.mockResolvedValue([[{ id: 10, role: 'provider', is_demo: 1 }, { id: 11, role: 'provider', is_active: 0 }, { id: 12, role: 'provider', is_archived: 1 }, { id: 13, role: 'provider', status: 'TERMINATED_PENDING' }]]);
  await notifyExchangeMatches({ listing });
  expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('cannot send a matching notification when the provider does not accept the client insurance', async () => {
  mocks.accepted.mockResolvedValue({ accepted: [{ name: 'Aetna' }], known: true, excluded: [] });
  await notifyExchangeMatches({ listing: { ...listing, preferences: { modality: 'virtual', insurance: 'Tricare' } } });
  expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
