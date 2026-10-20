import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ execute: vi.fn(), create: vi.fn(), find: vi.fn(), attendees: vi.fn(), presenters: vi.fn(), membership: vi.fn(), calendar: vi.fn(), roster:vi.fn(), update:vi.fn(), series:vi.fn(), recur:vi.fn(), cancel:vi.fn(), move:vi.fn(), notices:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: {
  getAgencies: async id => Number(id) === 7 ? [{ id: 3 }] : [{ id: 2 }, { id: 3 }],
  findById: async id => ({ id, first_name: 'Example', email: `person${id}@example.test` }),
  getAgencySupervisionCompensableMap: async () => ({})
} }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: {
  create: m.create, findById: m.find, upsertAttendees: m.attendees, setPresenters: m.presenters,
  updateById:m.update,listActiveSeriesFromPoint:m.series,resolveByJoinRef: m.find, listAttendees:m.roster, listPresentersForSession:async()=>[]
} }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { ensure: vi.fn() } }));
vi.mock('../../models/SupervisionCasePresentation.model.js', () => ({ default: { ensureForPresenters: vi.fn() } }));
vi.mock('../../services/googleCalendar.service.js', () => ({ default: { upsertSupervisionSession: m.calendar } }));
vi.mock('../../services/video.service.js', () => ({ isVideoConfigured: () => false }));
vi.mock('../../utils/tenantMeetingUrl.js', () => ({ tenantMeetingBase: async () => 'https://agency.example.test' }));
vi.mock('../../services/meetingJoinPolicy.service.js', () => ({
  hasActiveMeetingMembership: m.membership, activeMeetingAgencyIds: async ids => ids,
  canJoinSupervision: async () => true, hasActiveSupervisionMembership: async () => true,
  requirePersonalSupervisionInvitation: vi.fn()
}));

vi.mock('../../services/supervisionRecurrenceEdit.service.js',()=>({makeSupervisionRecurring:m.recur}));
vi.mock('../../services/recurringScheduleCancellation.service.js',()=>({cancelMeetingOccurrences:m.cancel,withRecurringScheduleEdit:vi.fn()}));
vi.mock('../../services/supervisionReschedule.service.js',()=>({rescheduleSupervisionOccurrences:m.move}));
vi.mock('../../services/meetingInvitations.service.js',()=>({queueMeetingInvitations:async()=>({failed:0}),sendMeetingScheduleChange:m.notices}));

import { createSupervisionSession, patchSupervisionSession, cancelSupervisionSession, getSessionAttendees } from '../supervisionSessions.controller.js';

const session = { id: 100, agency_id: 2, supervisor_user_id: 1, supervisee_user_id: 7, session_type: 'group', status: 'SCHEDULED' };
const body = {
  agencyId: 2, supervisorUserId: 1, superviseeUserId: 7, sessionType: 'group', allAgencies: true,
  startAt: '2026-11-19T13:00', endAt: '2026-11-19T14:00', timeZone: 'America/Denver',
  additionalAttendeeUserIds: [8], presenterUserIds: [7], notifyParticipants: false
};
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  m.membership.mockResolvedValue(true);
  m.roster.mockResolvedValue([]);
  m.create.mockResolvedValue(session);
  m.find.mockResolvedValue(session);
  m.calendar.mockResolvedValue({ skipped: true });
  m.execute.mockImplementation(async sql => sql.includes('SELECT DISTINCT u.id') ? [[{ id: 1 }, { id: 7 }, { id: 8 }]] : [[]]);
});

it('creates a new cross-agency group with mandatory presenters and optional other attendees', async () => {
  const res = response(), next = vi.fn();
  await createSupervisionSession({ user: { id: 1, role: 'admin' }, body }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ initialStatus: 'SCHEDULED', presenterUserIds: [7] }));
  expect(m.attendees).toHaveBeenCalledWith(100, expect.arrayContaining([
    expect.objectContaining({ userId: 7, isRequired: true }),
    expect.objectContaining({ userId: 8, isRequired: false })
  ]));
});

it('records an omitted holiday date as canceled without a presenter or calendar invitation', async () => {
  const res = response(), next = vi.fn();
  await createSupervisionSession({ user: { id: 1, role: 'admin' }, body: { ...body, canceled: true, cancelReason: 'Thanksgiving week', recurrenceSeriesId: 'series' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ initialStatus: 'CANCELLED' }));
  expect(m.presenters).not.toHaveBeenCalled();
  expect(m.calendar).not.toHaveBeenCalled();
});

it('allows an invited cross-agency attendee to join but not edit the group session', async () => {
  m.membership.mockResolvedValue(false);
  const res = response(), next = vi.fn();
  await patchSupervisionSession({ params: { id: 100 }, user: { id: 7, role: 'provider' }, body: { notes: 'Changed' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ error: { message: expect.stringContaining('Only a host') } });
});

it('allows an explicitly invited cross-agency cohost through edit authorization', async () => {
  m.membership.mockResolvedValue(false);
  m.find.mockResolvedValue({ ...session, co_facilitator_user_id: 8 });
  const res = response(), next = vi.fn();
  await patchSupervisionSession({ params: { id: 100 }, user: { id: 8, role: 'provider' }, body: {} }, res, next);
  expect(next).not.toHaveBeenCalled();
  // This fixture intentionally has no times: reaching date validation proves
  // the explicit cohost passed both edit gates without host-tenant membership.
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: { message: 'Invalid startAt/endAt' } });
});

it.each([['provider',false],['support',true],['admin',true]])('returns confirmed supervision RSVPs but protects declines from ordinary %s viewers',async(role,canSeeDeclined)=>{
 m.roster.mockResolvedValue([{user_id:7,first_name:'Yes',status:'SIGNED_UP'},{user_id:9,first_name:'No',status:'DECLINED',decline_reason:'Private reason'}]);
 const res=response(),next=vi.fn();
 m.find.mockResolvedValue({...session,supervisee_user_id:8});
 await getSessionAttendees({params:{id:100},user:{id:8,role}},res,next);
 expect(next).not.toHaveBeenCalled();const result=res.json.mock.calls[0][0];
 expect(result.canSeeDeclined).toBe(canSeeDeclined);
 expect(result.attendees.map(p=>p.userId)).toEqual(canSeeDeclined?[7,9]:[7]);
 if(!canSeeDeclined)expect(JSON.stringify(result)).not.toContain('Private reason');
});

it('persists the repeat selection from an edit and creates the future series',async()=>{
 const row={...session,supervisor_user_id:1,session_type:'individual',start_at:'2026-11-19 20:00:00',end_at:'2026-11-19 21:00:00',event_timezone:'America/Denver'};
 m.find.mockResolvedValue(row);m.update.mockResolvedValue(row);m.recur.mockResolvedValue({createdIds:[101,102]});
 const res=response(),next=vi.fn();
 await patchSupervisionSession({params:{id:100},user:{id:1,role:'admin'},body:{recurrenceFrequency:'WEEKLY',recurrencePolicy:'INDEFINITE',notifyParticipants:false}},res,next);
 expect(next).not.toHaveBeenCalled();expect(m.recur).toHaveBeenCalledWith(expect.objectContaining({id:100,frequency:'WEEKLY',policy:'INDEFINITE',actorUserId:1}));
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ok:true,recurrence:{createdIds:[101,102]}}));
});
for(const scope of ['single','future']) it(`applies supervision details only to the explicitly selected ${scope} scope`,async()=>{
 const row={...session,session_type:'individual',start_at:'2026-11-19 20:00:00',end_at:'2026-11-19 21:00:00',recurrence_series_id:'weekly'};
 m.find.mockResolvedValue(row);m.update.mockResolvedValue(row);m.series.mockResolvedValue([row,{...row,id:101}]);
 const res=response(),next=vi.fn();
 await patchSupervisionSession({params:{id:100},user:{id:1,role:'admin'},body:{scope,modality:'virtual',notes:'Updated location',notifyParticipants:false}},res,next);
 expect(next).not.toHaveBeenCalled();expect(m.update.mock.calls.map(([id])=>id)).toEqual(scope==='single'?[100]:[100,101]);
 expect(m.update.mock.calls.every(([,body])=>body.modality==='virtual'&&body.notes==='Updated location')).toBe(true);
});
it('requires a reason before cancelling supervision',async()=>{
 const res=response(),next=vi.fn();
 await cancelSupervisionSession({params:{id:100},user:{id:1,role:'admin'},body:{scope:'single'}},res,next);
 expect(res.status).toHaveBeenCalledWith(400);expect(m.cancel).not.toHaveBeenCalled();
});
for(const scope of ['single','future']) it(`cancels ${scope} supervision with the supplied reason and notification choice`,async()=>{
 m.cancel.mockResolvedValue({rows:[{...session,start_at:'2099-01-01 20:00:00'}],cancelledCount:1});
 const res=response(),next=vi.fn();
 await cancelSupervisionSession({params:{id:100},user:{id:1,role:'admin'},body:{scope,cancelReason:'Unavailable',notifyParticipants:false}},res,next);
 expect(next).not.toHaveBeenCalled();expect(m.cancel).toHaveBeenCalledWith({kind:'supervision',eventId:100,scope,actorUserId:1,cancelReason:'Unavailable'});expect(m.notices).not.toHaveBeenCalled();
});
