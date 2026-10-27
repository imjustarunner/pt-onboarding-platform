import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {} }));
vi.mock('../providerAvailability.service.js', () => ({ default: {} }));
vi.mock('../appointmentChange.service.js', () => ({ previewAppointmentChange: vi.fn(), completeAppointmentChange: vi.fn() }));
vi.mock('../availabilityPublicationEdit.service.js', () => ({ editAvailabilityPublication: vi.fn() }));
vi.mock('../recurringScheduleCancellation.service.js', () => ({ cancelMeetingOccurrences: vi.fn() }));
vi.mock('../meetingInvitations.service.js', () => ({ sendMeetingScheduleChange: vi.fn() }));
vi.mock('../../utils/invalidateAvailabilityReminders.js', () => ({ invalidateAvailabilityReminders: vi.fn() }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: vi.fn(), maybeDecryptNotePayload: vi.fn() }));
import { createDayCancellationService, dayBounds, dayCancellationFacts } from '../providerDayCancellation.service.js';

const actor = { id: 9, role: 'provider' };
const input = { providerId: 9, agencyIds: [2], date: '2026-11-04', clientFacingReason: 'Provider unavailable.', internalReason: 'Private staffing detail.', messagesReviewed: true };
let service, database, dependencies, record, appointments, weekly, blocks, authorize, appointmentAccess, recipients;
beforeEach(() => {
  record = null; blocks = []; weekly = [];
  recipients = [{ clientId: 12, displayName: 'Client One', receivesReminders: true }];
  appointments = [{ id: 1, providerUserId: 9, agencyId: 2, status: 'scheduled', title: 'Session', startAt: '2026-11-04 18:00:00', endAt: '2026-11-04 19:00:00', updatedAt: '2026-10-01 00:00:00' }];
  const execute = vi.fn(async (sql, args = []) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql.startsWith('INSERT INTO provider_day_cancellations')) { record = { token: args[0], provider_id: args[1], actor_user_id: args[2], cancellation_date: args[3], plan_json: args[4], results_json: '{}', status: 'preview', expires_at: '2026-11-01 01:00:00' }; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM provider_day_cancellations WHERE provider_id')) return [[record].filter(r => r && r.provider_id === args[0] && r.actor_user_id === args[1] && r.cancellation_date === args[2] && ['processing', 'partial'].includes(r.status))];
    if (sql.startsWith('SELECT * FROM provider_day_cancellations')) return [[record].filter(r => r && r.token === args[0] && (args.length === 1 || r.actor_user_id === args[1]))];
    if (sql.includes("SET status='processing'")) { record.status = 'processing'; return [{}]; }
    if (sql.includes('SET results_json=')) { record.results_json = args[0]; record.status = args[1]; return [{}]; }
    if (sql.startsWith('INSERT INTO provider_schedule_events')) { blocks.push(args); return [{ insertId: 100 }]; }
    if (sql.includes('FROM provider_virtual_working_hours')) return [sql.includes('WHERE id=?') ? weekly.filter(r => r.id === args[0]) : weekly];
    if (sql.includes('FROM provider_schedule_events') || sql.includes('FROM supervision_sessions') || sql.includes('FROM provider_virtual_slot_availability') || sql.includes('FROM provider_in_person_slot_availability')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const conn = { execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  database = { execute, getConnection: vi.fn(async () => conn) };
  dependencies = { database, now: () => new Date('2026-11-01T00:00:00Z'), timeZone: async () => 'America/Denver',
    encrypt: vi.fn(s => JSON.stringify({ testEncrypted: s })), decrypt: s => JSON.parse(s).testEncrypted,
    listAppointments: vi.fn(async () => structuredClone(appointments)), getAppointment: vi.fn(async id => structuredClone(appointments.find(a => a.id === id))),
    participants: vi.fn(async () => structuredClone(recipients)), previewAppointment: vi.fn(async () => ({ narrative: 'Provider unavailable. No service rendered.' })),
    completeAppointment: vi.fn(async id => { appointments.find(a => a.id === id).status = 'canceled_by_provider'; return { notificationDelivery: { sent: 1, failed: 0 } }; }),
    editPublication: vi.fn(async options => { weekly.find(r => r.id === options.id).excluded_dates_json = JSON.stringify([options.occurrenceDate]); }),
    contacts: vi.fn(async id => ({ clientId: id, clientName: 'Client One', mode:'guardian', channels:['email'], contacts:[], recipients:[] })),
    schools: vi.fn(async () => []), schoolReview: (item, edits) => ({ ...item, ...edits }), notifySchool: vi.fn(async () => ({sent:1})),
    cancellationMessage: vi.fn(() => ({ subject:'Canceled', text:'Canceled', when:'Wednesday' })), validateOffer: vi.fn(),
    ensureTask: vi.fn(async () => 72), completeTask: vi.fn(), notifyAppointment: vi.fn(async () => ({ pending: 1 })), invalidate: vi.fn() };
  service = createDayCancellationService(dependencies); authorize = vi.fn(); appointmentAccess = vi.fn();
});
const preview = () => service.preview(input, actor, authorize, appointmentAccess);
const apply = (plan, extra = {}) => service.apply(plan.token, { providerId: 9, signatureConfirmed: true, ...extra }, actor, authorize, appointmentAccess);

describe('reviewed provider-day cancellation', () => {
  it('uses actual local midnight across DST rather than assuming a 24-hour day', () => {
    expect(dayBounds('2026-11-01', 'America/Denver')).toEqual({ start: '2026-11-01 06:00:00', end: '2026-11-02 07:00:00' });
    expect(() => dayBounds('2026-02-30', 'America/Denver')).toThrow('valid date');
  });
  it('requires a reviewed public reason and keeps private details out of session facts', () => {
    expect(() => dayCancellationFacts({ reasonCategory: 'detailed private reason' })).toThrow('category');
    expect(dayCancellationFacts(input)).toMatchObject({ initiator: 'provider', reasonOther: '', clientFacingReason: 'Provider availability', followUpAction: 'client_contact_support' });
    expect(() => dayCancellationFacts({ ...input, followUpAction: 'support_will_contact' })).toThrow('supported follow-up');
  });
  it('previews without sending or canceling and encrypts internal audit details', async () => {
    const plan = await preview();
    expect(plan.items[0]).toMatchObject({ kind: 'appointment', recipients: ['Client One'] });
    expect(JSON.stringify(plan)).not.toContain(input.internalReason);
    expect(dependencies.encrypt).toHaveBeenCalled();
    expect(dependencies.completeAppointment).not.toHaveBeenCalled(); expect(blocks).toHaveLength(0);
  });
  it('rejects access before reading or writing the plan', async () => {
    authorize.mockRejectedValue(new Error('Access denied'));
    await expect(preview()).rejects.toThrow('Access denied');
    expect(dependencies.listAppointments).not.toHaveBeenCalled(); expect(record).toBeNull();
  });
  it('requires a signature and the original actor and provider', async () => {
    const plan = await preview();
    await expect(apply(plan, { signatureConfirmed: false })).rejects.toThrow('sign');
    await expect(service.apply(plan.token, { providerId: 9, signatureConfirmed: true }, { id: 22 }, authorize, appointmentAccess)).rejects.toThrow('not found');
    await expect(apply(plan, { providerId: 22 })).rejects.toThrow('not found');
    expect(blocks).toHaveLength(0);
  });
  it('rejects stale recipients before any cancellation or unavailable block', async () => {
    const plan = await preview(); recipients.push({ clientId: 13 });
    await expect(apply(plan)).rejects.toThrow('schedule changed');
    expect(dependencies.completeAppointment).not.toHaveBeenCalled(); expect(blocks).toHaveLength(0);
  });
  it('rejects expired reviews', async () => {
    const plan = await preview(); record.expires_at = '2026-10-01 00:00:00';
    await expect(apply(plan)).rejects.toThrow('expired'); expect(blocks).toHaveLength(0);
  });
  it('runs the signed provider cancellation once and retains its delivery status on repeat', async () => {
    const plan = await preview(); const first = await apply(plan); const repeated = await apply(plan);
    expect(first.status).toBe('completed'); expect(repeated.results['appointment:1'].notificationDelivery.sent).toBe(1);
    expect(dependencies.completeAppointment).toHaveBeenCalledTimes(1); expect(blocks).toHaveLength(1);
    expect(dependencies.completeAppointment.mock.calls[0][1]).toMatchObject({ initiator: 'provider', signatureConfirmed: true, reasons: ['provider_unavailable'] });
  });
  it('keeps started appointments unchanged while blocking the rest of the day', async () => {
    appointments[0].startAt = '2026-11-01 00:00:00';
    const plan = await preview(); expect(plan.unchanged).toHaveLength(1); expect(plan.items).toHaveLength(0);
    const result = await apply(plan); expect(result.status).toBe('completed'); expect(blocks).toHaveLength(1); expect(dependencies.completeAppointment).not.toHaveBeenCalled();
  });
  it('records partial failure and continues other items; retry only retries failed work', async () => {
    appointments.push({ ...appointments[0], id: 2 });
    const plan = await preview(); dependencies.completeAppointment.mockRejectedValueOnce(new Error('temporary outage'));
    const first = await apply(plan); expect(first.status).toBe('processing'); expect(first.results['appointment:1'].status).toBe('failed');
    const second = await apply(plan); expect(second.status).toBe('partial');
    const third = await apply(plan, { retryFailed: true }); expect(third.status).toBe('completed');
    expect(dependencies.completeAppointment.mock.calls.map(c => c[0])).toEqual([1, 2, 1]); expect(blocks).toHaveLength(1);
  });
  it('removes a weekly opening only for the selected occurrence', async () => {
    appointments = [];
    weekly = [{ id: 5, day_of_week: 'Wednesday', start_time: '08:00:00', end_time: '09:00:00', frequency: 'WEEKLY', start_date: '2026-01-07', end_date: null, excluded_dates_json: '[]' }];
    const plan = await preview(); expect(plan.items).toHaveLength(1); await apply(plan);
    expect(dependencies.editPublication).toHaveBeenCalledWith(expect.objectContaining({ kind: 'weekly', action: 'delete', scope: 'single', occurrenceDate: input.date }));
  });
  it('does not treat every day as an occurrence of unbounded weekly hours', async () => {
    appointments = [];
    weekly = [{ id: 5, day_of_week: 'Tuesday', start_time: '08:00:00', end_time: '09:00:00', frequency: 'WEEKLY', start_date: null, excluded_dates_json: '[]' }];
    expect((await preview()).items).toHaveLength(0);
  });
  it('restores an interrupted plan only to its original actor without more mutations', async () => {
    appointments.push({ ...appointments[0], id: 2 });
    const plan = await preview(); await apply(plan);
    const restored = await service.resume({ providerId: 9, date: input.date }, actor, authorize);
    expect(restored.review).toMatchObject({ token: plan.token, status: 'processing', remaining: 1 });
    expect(dependencies.completeAppointment).toHaveBeenCalledTimes(1);
    expect(await service.resume({ providerId: 9, date: input.date }, { id: 99 }, authorize)).toEqual({ review: null });
  });
  it('does not remove a weekly opening changed while other items were processing', async () => {
    weekly = [{ id: 5, day_of_week: 'Wednesday', start_time: '08:00:00', end_time: '09:00:00', frequency: 'WEEKLY', start_date: null, excluded_dates_json: '[]' }];
    const plan = await preview(); await apply(plan);
    weekly[0].start_time = '08:15:00';
    const result = await apply(plan);
    expect(result.status).toBe('partial'); expect(result.results['weekly:5'].message).toMatch(/changed/);
    expect(dependencies.editPublication).not.toHaveBeenCalled();
  });
  it('leaves a multi-day hosted event intact and identifies it for individual review', async () => {
    appointments = []; const original = database.execute.getMockImplementation();
    database.execute.mockImplementation((sql, args) => {
      if (sql.includes('FROM provider_schedule_events')) return [[{ id: 5, title: 'Retreat', all_day: 1, start_date: '2026-11-03', end_date: '2026-11-06', start_at: null, end_at: null, status: 'ACTIVE' }]];
      if (sql.includes('FROM provider_schedule_event_attendees')) return [[]];
      return original(sql, args);
    });
    const plan = await preview(); expect(plan.items).toHaveLength(0);
    expect(plan.unchanged[0].detail).toMatch(/multiple dates/);
  });
});


describe('selected sessions, dates and reviewed outreach', () => {
  it('requires the editable recipient/message review before any cancellation or school email', async () => {
    const plan = await service.preview({ ...input, messagesReviewed: false }, actor, authorize, appointmentAccess);
    await expect(apply(plan)).rejects.toThrow('editable emails');
    expect(dependencies.completeAppointment).not.toHaveBeenCalled(); expect(dependencies.notifySchool).not.toHaveBeenCalled(); expect(blocks).toHaveLength(0);
  });
  it('cancels only selected sessions without blocking the whole day or removing its openings', async () => {
    appointments.push({ ...appointments[0], id: 2 });
    const plan = await service.preview({ ...input, scopeMode: 'sessions', appointmentIds: [2] }, actor, authorize, appointmentAccess);
    expect(plan.items.map(i => i.id)).toEqual([2]);
    await apply(plan); expect(blocks).toHaveLength(0);
    expect(appointments[0].status).toBe('scheduled'); expect(appointments[1].status).toBe('canceled_by_provider');
    expect(dependencies.editPublication).not.toHaveBeenCalled();
  });
  it('blocks each selected date with its own timezone bounds and keeps shared reasons', async () => {
    const plan = await service.preview({ ...input, dates: ['2026-11-04','2026-11-05'] }, actor, authorize, appointmentAccess);
    await apply(plan); expect(blocks).toHaveLength(2);
    expect(blocks.map(b => b[4])).toEqual(['2026-11-04','2026-11-05']);
    expect(dependencies.completeAppointment.mock.calls[0][1].clientFacingReason).toBe('Provider availability');
  });
  it('includes assigned-school messages even on a day with no client appointments, and sends only the reviewed edit', async () => {
    appointments = [];
    const school = { key:'school:2:10:2026-11-04',kind:'school',id:10,agencyId:2,date:input.date,title:'School',recipients:['office@example.test'],message:{subject:'Original',text:'Original'} };
    dependencies.schools.mockResolvedValue([school]);
    const edit = { recipients:['new@example.test','extra@example.test'],message:{subject:'Reviewed subject',text:'Reviewed message'} };
    const plan = await service.preview({ ...input, schoolChoices:{[school.key]:edit} },actor,authorize,appointmentAccess);
    expect(dependencies.notifySchool).not.toHaveBeenCalled();
    expect(plan.items[0]).toMatchObject(edit);
    await apply(plan); await apply(plan);
    expect(dependencies.notifySchool).toHaveBeenCalledExactlyOnceWith(plan.token,expect.objectContaining(edit),actor.id);
  });
  it('validates shared private slots and refuses a replacement on a canceled day', async () => {
    const slot = {startAt:'2026-11-04T20:00:00Z',endAt:'2026-11-04T21:00:00Z',modality:'VIRTUAL'};
    await expect(service.preview({...input,followUpAction:'private_slots',offeredSlots:[slot]},actor,authorize,appointmentAccess)).rejects.toThrow('outside the canceled days');
    slot.startAt='2026-11-06T20:00:00Z';slot.endAt='2026-11-06T21:00:00Z';
    const plan=await service.preview({...input,followUpAction:'private_slots',offeredSlots:[slot],offerDays:3},actor,authorize,appointmentAccess);
    await apply(plan);
    expect(dependencies.completeAppointment.mock.calls[0][1]).toMatchObject({followUpAction:'private_slots',offerDays:3,offeredSlots:[slot]});
  });
  it('rejects sessions outside the authorized inventory and rechecks contact changes', async () => {
    await expect(service.preview({...input,scopeMode:'sessions',appointmentIds:[999]},actor,authorize,appointmentAccess)).rejects.toThrow('outside these dates');
    const plan=await preview();
    dependencies.contacts.mockResolvedValue({clientId:12,mode:'guardian',channels:['email'],contacts:[{email:'changed@example.test'}],recipients:[]});
    await expect(apply(plan)).rejects.toThrow('schedule changed'); expect(blocks).toHaveLength(0);
  });
});

it('shares only a category even when a detailed reason was supplied by an older client', () => {
  const facts = dayCancellationFacts({ ...input, reasonCategory: 'weather', clientFacingReason: 'Private details', internalReason: 'Private details' });
  expect(facts.clientFacingReason).toBe('Weather conditions'); expect(JSON.stringify(facts)).not.toContain('Private details');
});
it('defers family and school notifications and creates one durable follow-up task', async () => {
  dependencies.schools.mockResolvedValue([{ key:'school:2:3:2026-11-04',kind:'school',agencyId:2,date:'2026-11-04',recipients:['school@example.test'],message:{subject:'Schedule',text:'Canceled'} }]);
  const plan = await service.preview({ ...input, notificationMode:'none', suppressionReason:'Review later' }, actor, authorize, appointmentAccess);
  let result = await apply(plan); while(result.status === 'processing') result = await apply(plan);
  expect(result.notificationTaskId).toBe(72); expect(dependencies.ensureTask).toHaveBeenCalledTimes(1);
  expect(dependencies.completeAppointment.mock.calls[0][1].notificationMode).toBe('none'); expect(dependencies.notifySchool).not.toHaveBeenCalled();
  expect(dependencies.notifyAppointment).not.toHaveBeenCalled();
  const followup = await service.preview({ providerId:9,deferredToken:plan.token,messagesReviewed:true },actor,authorize,appointmentAccess);
  expect(followup.notificationsOnly).toBe(true); expect(dependencies.notifyAppointment).not.toHaveBeenCalled();
  result=await apply(followup); while(result.status === 'processing') result=await apply(followup);
  expect(dependencies.completeAppointment).toHaveBeenCalledTimes(1); expect(dependencies.notifyAppointment).toHaveBeenCalledTimes(1);
  expect(dependencies.notifySchool).toHaveBeenCalledTimes(1); expect(blocks).toHaveLength(1); expect(dependencies.completeTask).toHaveBeenCalledWith(plan.token);
});
