import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ rows:vi.fn(), send:vi.fn(), mark48:vi.fn(), mark24:vi.fn(), expire:vi.fn() }));
vi.mock('../../models/HiringReferenceRequest.model.js', () => ({ default:{ expireStaleRows:mocks.expire,listPendingForReminders:mocks.rows,markReminder48h:mocks.mark48,markReminder24h:mocks.mark24 } }));
vi.mock('../hiringReferenceIdentity.service.js', () => ({ resolveHiringReferenceSenderIdentity:vi.fn(async () => ({id:1})) }));
vi.mock('../../models/User.model.js', () => ({ default:{findById:vi.fn(async () => ({first_name:'Applicant'}))} }));
vi.mock('../../models/Agency.model.js', () => ({ default:{findById:vi.fn(async () => ({name:'Agency'}))} }));
vi.mock('../hiringReferenceRequests.service.js', () => ({ buildReferenceFormUrl:token=>`https://example.test/${token}`,buildPeopleOpsContactFooter:()=>({text:'PO',html:'PO'}),sendHiringReferenceOutboundEmail:mocks.send }));
vi.mock('../hiringReferenceActivity.service.js', () => ({logHiringReferenceEvent:vi.fn()}));
import { runHiringReferenceReminderTick } from '../hiringReferenceReminder.service.js';
const row = { id:1,agency_id:2,candidate_user_id:3,reference_email:'ref@example.test',public_link_token:'secure',sent_at:'2026-10-06T12:00:00Z',token_expires_at:'2026-10-13T12:00:00Z' };
beforeEach(() => {vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));mocks.send.mockResolvedValue({ok:true});});
describe('reference reminders', () => {
  it('sends once after 48 hours, even when the deadline is more than three days away', async () => {mocks.rows.mockResolvedValue([row]);await runHiringReferenceReminderTick();expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.mark48).toHaveBeenCalledWith(1);expect(mocks.send.mock.calls[0][0].html).toContain('https://example.test/secure');});
  it('does not remind before 48 hours or repeat a successful reminder', async () => {mocks.rows.mockResolvedValue([{...row,sent_at:'2026-10-07T12:00:00Z'},{...row,reminder_48h_sent_at:'2026-10-08T12:00:00Z'}]);await runHiringReferenceReminderTick();expect(mocks.send).not.toHaveBeenCalled();});
  it('keeps failed reminders eligible for retry', async () => {mocks.rows.mockResolvedValue([row]);mocks.send.mockResolvedValue({ok:false,error:'temporary failure'});await runHiringReferenceReminderTick();expect(mocks.mark48).not.toHaveBeenCalled();});
  it('never sends expired reminders', async () => {mocks.rows.mockResolvedValue([{...row,token_expires_at:'2026-10-07T12:00:00Z'}]);await runHiringReferenceReminderTick();expect(mocks.send).not.toHaveBeenCalled();});
});
