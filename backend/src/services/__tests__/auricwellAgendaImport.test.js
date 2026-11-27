import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../controllers/appointment.controller.js', () => ({ createAppointmentHandler: vi.fn() }));
import { createAuricwellAgendaImporter } from '../auricwellAgendaImport.service.js';
import { agendaClock, parseAuricwellAgendaPaste } from '../../utils/auricwellAgendaPaste.js';
import { createAppointmentHandler } from '../../controllers/appointment.controller.js';

const actor = { id: 7, role: 'admin' };
const context = () => ({ agencyId: 2, providerId: 19, timeZone: 'America/Denver', provider: { id: 19, status: 'active' },
  clients: [{ id: 41, full_name: 'Avery Hart', status: 'active', updated_at: '2026-10-01' }, { id: 42, full_name: 'Jamie Quinn', status: 'active', updated_at: '2026-10-01' }],
  services: [{ id: 3, name: 'Individual therapy', serviceCode: '90834', modality: 'EITHER' }],
  locations: [{ id: 5, name: 'Office', place_of_service: '11' }, { id: 6, name: 'Telehealth', place_of_service: '10' }] });
const base = () => ({ agencyId: 2, providerId: 19, weekStart: '2026-10-19', timeZone: 'America/Denver', text: 'Monday | 09:00 | 09:50 | Avery Hart',
  defaults: { tenantServiceId: 3, serviceLocationId: 5, modality: 'IN_PERSON', recurrence: 'ONCE' } });
let saved, deps, service;
beforeEach(() => {
  saved = new Map();
  deps = { loadContext: vi.fn(async () => context()), findExisting: vi.fn(async row => saved.get(row.source) || null), checkConflict: vi.fn(async () => {}),
    book: vi.fn(async ({ row }) => { const appointment = { id: saved.size + 100, source: row.source }; saved.set(row.source, appointment); return appointment; }),
    completeFacets: vi.fn(async ({ appointment }) => appointment), sameDay: vi.fn(async () => []), checkSchool: vi.fn(async () => ({ slotId: 11 })), linkSchool: vi.fn(async () => {}),
    lock: vi.fn(async (_, work) => work()), clientLock: vi.fn(async (_, work) => work()), sign: claims => JSON.stringify(claims), verify: JSON.parse, now: () => Date.parse('2026-10-12T12:00:00Z') };
  service = createAuricwellAgendaImporter(deps);
});

describe('weekly agenda paste suggestions', () => {
  it('reads explicit dates, weekday headings, 24-hour and AM/PM times without inventing clients', () => {
    const rows = parseAuricwellAgendaPaste('Monday\n09:00 - 09:50 | Avery Hart\nTuesday | 1:00 PM | 1:50 PM | Jamie Quinn', '2026-10-19');
    expect(rows.map(row => [row.clientInput, row.date, row.startTime, row.endTime])).toEqual([['Avery Hart', '2026-10-19', '09:00', '09:50'], ['Jamie Quinn', '2026-10-20', '13:00', '13:50']]);
    expect(agendaClock('9')).toBeNull();
    expect(agendaClock('12:00 AM')).toBe('00:00');
    expect(agendaClock('25:00')).toBeNull();
  });
  it('retains unknown lines for review and rejects an implicit or invalid week', () => {
    expect(parseAuricwellAgendaPaste('Lunch break', '2026-10-19')[0]).toMatchObject({ clientInput: 'Lunch break', date: '', startTime: null });
    expect(() => parseAuricwellAgendaPaste('Monday 09:00 | Avery', '2026-10-20')).toThrow('Monday');
    expect(() => parseAuricwellAgendaPaste('x'.repeat(100001), '2026-10-19')).toThrow('100,000');
  });
});

describe('reviewed agenda creation', () => {
  it('previews without writes, creates canonical appointments only after confirmation, and reuses retry fingerprints', async () => {
    const input = base(), preview = await service.preview({ actor, input });
    expect(preview.summary).toMatchObject({ newAppointments: 1, blockedRows: 0 });
    expect(deps.book).not.toHaveBeenCalled();
    expect(deps.linkSchool).not.toHaveBeenCalled();
    const commit = { ...input, rows: preview.rows, previewToken: preview.previewToken, confirm: true };
    expect((await service.commit({ actor, input: commit })).createdCount).toBe(1);
    expect((await service.commit({ actor, input: commit })).existingCount).toBe(1);
    expect(deps.book).toHaveBeenCalledTimes(1);
    expect(deps.clientLock).toHaveBeenCalledTimes(2);
    expect(deps.book.mock.calls[0][0].row.source).toMatch(/^aw_agenda:[a-f0-9]{50}$/);
  });

  it('delegates real booking to the shared appointment controller with canonical identities and explicit instants', async () => {
    const { book: ignored, ...otherDeps } = deps;
    createAppointmentHandler.mockImplementation(async (req, res) => res.status(201).json({ appointment: { id: 201, source: req.body.source } }));
    const canonical = createAuricwellAgendaImporter(otherDeps), input = base();
    const preview = await canonical.preview({ actor, input });
    const result = await canonical.commit({ actor, input: { ...input, rows: preview.rows, confirm: true, previewToken: preview.previewToken } });
    expect(result).toMatchObject({ complete: true, createdCount: 1 });
    expect(createAppointmentHandler).toHaveBeenLastCalledWith(expect.objectContaining({ user: actor, body: expect.objectContaining({
      agencyId: 2, providerUserId: 19, tenantServiceId: 3, participants: [{ clientId: 41, role: 'client' }], serviceLocationId: 5,
      startAt: '2026-10-19T15:00:00Z', endAt: '2026-10-19T15:50:00Z', timeZone: 'America/Denver', recurrence: 'ONCE', createProviderScheduleEvent: true
    }) }), expect.any(Object), expect.any(Function));
  });

  it('requires explicit identity selection for duplicate names and preserves editable values on blocked rows', async () => {
    deps.loadContext.mockResolvedValue({ ...context(), clients: [...context().clients, { id: 99, full_name: 'Avery Hart', status: 'active' }] });
    const preview = await service.preview({ actor, input: base() });
    expect(preview.previewToken).toBeNull();
    expect(preview.rows[0]).toMatchObject({ clientId: null, date: '2026-10-19', startTime: '09:00', tenantServiceId: 3, serviceLocationId: 5 });
    const fixed = await service.preview({ actor, input: { ...base(), rows: [{ ...preview.rows[0], clientId: 41 }] } });
    expect(fixed.summary.blockedRows).toBe(0);
  });

  it('refuses an archived chart even if it was present in stale provider options', async () => {
    deps.loadContext.mockResolvedValue({ ...context(), clients: context().clients.map(client => ({ ...client, status: 'ARCHIVED' })) });
    const preview = await service.preview({ actor, input: base() });
    expect(preview.summary.blockedRows).toBe(1);
    expect(preview.previewToken).toBeNull();
    expect(preview.rows[0].errors[0]).toContain('active status');
    expect(deps.book).not.toHaveBeenCalled();
  });

  it('rejects scope tampering, stale records, changed reviewed times, and expired previews before writes', async () => {
    const input = base(), preview = await service.preview({ actor, input });
    const commit = { ...input, rows: preview.rows, previewToken: preview.previewToken, confirm: true };
    await expect(service.commit({ actor: { ...actor, id: 8 }, input: commit })).rejects.toMatchObject({ status: 403 });
    await expect(service.commit({ actor, input: { ...commit, confirm: false } })).rejects.toMatchObject({ status: 400 });
    await expect(service.commit({ actor, input: { ...commit, rows: [{ ...preview.rows[0], startTime: '10:00', endTime: '10:50' }] } })).rejects.toMatchObject({ code: 'AGENDA_PREVIEW_STALE' });
    deps.loadContext.mockResolvedValue({ ...context(), clients: context().clients.map(client => ({ ...client, updated_at: '2026-10-13' })) });
    await expect(service.commit({ actor, input: commit })).rejects.toMatchObject({ code: 'AGENDA_PREVIEW_STALE' });
    await expect(service.commit({ actor, input: { ...commit, previewToken: 'expired' } })).rejects.toMatchObject({ code: 'AGENDA_PREVIEW_EXPIRED' });
    expect(deps.book).not.toHaveBeenCalled();
  });

  it('blocks real conflicts and overlaps within the pasted week without scheduling any row', async () => {
    deps.checkConflict.mockRejectedValue(Object.assign(new Error('Provider already booked'), { status: 409 }));
    let preview = await service.preview({ actor, input: base() });
    expect(preview.rows[0].errors).toContain('Provider already booked');
    deps.checkConflict.mockResolvedValue();
    preview = await service.preview({ actor, input: { ...base(), text: `${base().text}\nMonday | 09:30 | 10:20 | Jamie Quinn` } });
    expect(preview.rows[1].errors[0]).toContain('overlaps');
    expect(preview.previewToken).toBeNull();
    expect(deps.book).not.toHaveBeenCalled();
  });

  it('keeps recurring wall times through DST and rejects ambiguous or nonexistent occurrences', async () => {
    const input = { ...base(), weekStart: '2026-10-26', defaults: { ...base().defaults, recurrence: 'WEEKLY', occurrenceCount: 2 } };
    let preview = await service.preview({ actor, input });
    await service.commit({ actor, input: { ...input, rows: preview.rows, previewToken: preview.previewToken, confirm: true } });
    expect(deps.book.mock.calls.map(([{ row }]) => row.startAt)).toEqual(['2026-10-26 15:00:00', '2026-11-02 16:00:00']);
    expect(deps.book.mock.calls[0][0].row.seriesKey).toBe(deps.book.mock.calls[1][0].row.seriesKey);
    preview = await service.preview({ actor, input: { ...base(), weekStart: '2026-10-26', text: 'Sunday | 01:15 | 01:45 | Avery Hart' } });
    expect(preview.rows[0].errors[0]).toContain('repeats');
    preview = await service.preview({ actor, input: { ...base(), weekStart: '2027-03-08', text: 'Sunday | 02:15 | 02:45 | Avery Hart' } });
    expect(preview.rows[0].errors[0]).toContain('does not exist');
  });

  it('requires same-day review, prevents location mismatch, and requires a matching school transition before booking', async () => {
    deps.sameDay.mockResolvedValue([{ appointmentId: 4 }]);
    const input = base(), preview = await service.preview({ actor, input });
    await expect(service.commit({ actor, input: { ...input, rows: preview.rows, previewToken: preview.previewToken, confirm: true } })).rejects.toMatchObject({ code: 'SAME_DAY_SERVICE_WARNING' });
    expect((await service.commit({ actor, input: { ...input, rows: preview.rows, previewToken: preview.previewToken, confirm: true, acknowledgeSameDayServices: true } })).complete).toBe(true);
    let invalid = await service.preview({ actor, input: { ...base(), defaults: { ...base().defaults, modality: 'TELEHEALTH' } } });
    expect(invalid.rows[0].errors[0]).toContain('place of service');
    deps.loadContext.mockResolvedValue({ ...context(), locations: [{ id: 5, name: 'School', school_organization_id: 70, place_of_service: '03' }] });
    deps.checkSchool.mockRejectedValue(new Error('Activate the school transition first'));
    invalid = await service.preview({ actor, input: base() });
    expect(invalid.rows[0].errors[0]).toContain('Activate the school transition');
    expect(deps.linkSchool).not.toHaveBeenCalled();
  });

  it('reports partial saved IDs and retries without duplicating appointments after a linking failure', async () => {
    const input = base(), preview = await service.preview({ actor, input });
    deps.completeFacets.mockRejectedValueOnce(new Error('Clinical linkage interrupted'));
    const commit = { ...input, rows: preview.rows, previewToken: preview.previewToken, confirm: true };
    const partial = await service.commit({ actor, input: commit });
    expect(partial).toMatchObject({ complete: false, savedAppointmentIds: [100] });
    const retry = await service.commit({ actor, input: commit });
    expect(retry).toMatchObject({ complete: true, existingCount: 1 });
    expect(deps.book).toHaveBeenCalledTimes(1);
  });
});

describe('pasted schedule modes', () => {
  const text = `1
Monday 11/30
8:45 - 9:45AM
AvHa: Therapy Session (90837) - District 11- MEDICAID
12:30 - 1:15PM
JaQu: Therapy Session (90834) - Main Office-437 Sample Place
Thursday 12/3
11:00AM - 11:45AM
SaVe: Therapy Session (90834) - Telehealth
Monday 12/7
8:45 - 9:45AM
AvHa: Therapy Session (90837) - District 11
12:30 - 1:15PM
JaQu: Therapy Session (90834) - Main Office-437 Sample Place
Thursday 12/10
11:00AM - 11:45AM
SaVe: Therapy Session (90834) - Telehealth
Monday 12/14
8:45 - 9:45AM
AvHa: Therapy Session (90837) - District 11
12:30 - 1:15PM
JaQu: Therapy Session (90834) - Main Office-437 Sample Place
Thursday 12/17
1:10 - 2:10PM
CaPo: Therapy Session (90837) - District 11`;
  const scopedContext = () => ({
    ...context(),
    clients: [...context().clients, { id: 43, full_name: 'Sam Vera' }, { id: 44, full_name: 'Cameron Pope' }],
    services: [...context().services, { id: 4, serviceCode: '90837', modality: 'IN_PERSON' }],
    locations: [...context().locations.map(location => location.id !== 5 ? location :
      { ...location, physical_office_location_id: 90, billing_office_street: '437 Sample Place' }),
    { id: 7, name: 'Assigned School', place_of_service: '03', school_organization_id: 70 }],
    schoolAssignments: [{ client_id: 41, organization_id: 70 }, { client_id: 44, organization_id: 70 }],
    schoolSlots: [{ id: 11, client_id: 41, school_organization_id: 70, weekday: 'Monday' }]
  });
  const input = () => ({ ...base(), weekStart: '2026-11-30', text, scheduleMode: 'as_sent', defaults: {} });
  const commit = (input, preview) => service.commit({ actor, input: { ...input, rows: preview.rows, previewToken: preview.previewToken, confirm: true } });

  beforeEach(() => {
    deps.loadContext.mockImplementation(async () => scopedContext());
    deps.findOffice = vi.fn(async ({ row }) => row.date === '2026-11-30' ? { office: { id: 90 }, roomId: 91, label: 'Room 91' } : null);
    deps.bookOffice = vi.fn(async ({ row, existing }) => {
      if (existing) return existing;
      const appointment = { id: saved.size + 100, source: row.source, officeEventId: 92 };
      saved.set(row.source, appointment);
      return appointment;
    });
    service = createAuricwellAgendaImporter(deps);
  });

  it('books exactly the pasted dates with the assigned school, code and office building', async () => {
    const request = input();
    const preview = await service.preview({ actor, input: request });
    expect(preview.summary).toMatchObject({ newAppointments: 9, blockedRows: 0 });
    expect(preview.rows[0]).toMatchObject({ clientId: 41, startTime: '08:45', endTime: '09:45', durationMinutes: 60,
      serviceCode: '90837', serviceLocationId: 7, schoolSlotId: 11, replacesSchoolHold: true });
    expect(preview.rows[1]).toMatchObject({ clientId: 42, startTime: '12:30', endTime: '13:15', officeLocationId: 90,
      officeRooms: [{ date: '2026-11-30', label: 'Room 91' }] });
    expect(preview.rows[2]).toMatchObject({ clientId: 43, date: '2026-12-03', serviceLocationId: 6, modality: 'TELEHEALTH' });
    expect(preview.rows.at(-1)).toMatchObject({ clientId: 44, date: '2026-12-17', schoolSlotId: null });
    expect(deps.book).not.toHaveBeenCalled();
    expect(deps.findOffice.mock.calls.every(([call]) => !call.materialize)).toBe(true);
    const result = await commit(request, preview);
    expect(result).toMatchObject({ complete: true, createdCount: 9, officeRoomsBooked: 1, officeVisitsWithoutRoom: 2 });
    expect(deps.bookOffice).toHaveBeenCalledTimes(1);
    expect(deps.book.mock.calls.filter(([{ row }]) => row.officeLocationId === 90)).toHaveLength(2);
    expect(deps.linkSchool).toHaveBeenCalledTimes(3);
    expect((await commit(request, preview)).existingCount).toBe(9);
  });

  it('suggests weekly and biweekly recurrence, honors the end date and keeps an observed gap', async () => {
    const request = { ...input(), scheduleMode: 'recurring', untilDate: '2026-12-17' };
    const preview = await service.preview({ actor, input: request });
    expect(preview.summary).toMatchObject({ newAppointments: 9, blockedRows: 0, rows: 5 });
    expect(preview.rows.find(row => row.clientId === 41)).toMatchObject({ recurrence: 'WEEKLY', occurrenceDates: ['2026-11-30', '2026-12-07', '2026-12-14'] });
    expect(preview.rows.filter(row => row.clientId === 43).map(row => [row.date, row.recurrence])).toEqual([['2026-12-03', 'ONCE'], ['2026-12-10', 'ONCE']]);
    const biweekly = await service.preview({ actor, input: { ...request, untilDate: '2027-01-06',
      text: 'Monday 11/30 | 08:45 | 09:45 | Avery Hart\nMonday 12/14 | 08:45 | 09:45 | Avery Hart',
      defaults: { tenantServiceId: 4, serviceLocationId: 7 } } });
    expect(biweekly.rows[0]).toMatchObject({ recurrence: 'BIWEEKLY', occurrenceDates: ['2026-11-30', '2026-12-14', '2026-12-28'] });
  });

  it('requires explicit selection for multiple and missing initials', async () => {
    const duplicate = { id: 45, full_name: 'Ava Harris' };
    deps.loadContext.mockImplementation(async () => ({ ...scopedContext(), clients: [...scopedContext().clients, duplicate] }));
    const request = { ...input(), text: 'Monday 11/30\n8:45 - 9:45AM\nAvHa: Therapy Session (90837) - District 11\n11:00AM - 12:00PM\nXxYy: Therapy Session (90837) - District 11' };
    const preview = await service.preview({ actor, input: request });
    expect(preview.previewToken).toBeNull();
    expect(preview.rows.map(row => [row.clientId, row.clientCandidateIds])).toEqual([[null, [41, 45]], [null, []]]);
    const fixed = await service.preview({ actor, input: { ...request, rows: preview.rows.map((row, index) => ({ ...row, clientId: index ? 44 : 41 })) } });
    expect(fixed.summary.blockedRows).toBe(0);
    expect(deps.book).not.toHaveBeenCalled();
  });
});
