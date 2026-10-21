import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../familyLedger/copayAttendance.js',()=>({suppressAppointmentAttendanceCopays:vi.fn(),completeAppointmentAttendanceDocumentation:vi.fn()}));
import {suppressAppointmentAttendanceCopays} from '../familyLedger/copayAttendance.js';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ClinicalRecordRef.model.js', () => ({ default: { upsert: vi.fn() } }));
vi.mock('../appointmentWaiver.service.js', () => ({ queueAppointmentWaiver: vi.fn() }));
vi.mock('../appointmentClinicalLink.service.js', () => ({ ensureAppointmentClinicalLink: vi.fn() }));
vi.mock('../appointmentChangeNote.service.js', () => ({ assertAppointmentChangeDocumentation: vi.fn(), blockAppointmentChangeClaims: vi.fn(), attachAppointmentChangeNotes: vi.fn() }));
vi.mock('../guardianAppointments.service.js',()=>({requireAppointmentRequestProvider:vi.fn(),recordGuardianAppointmentApproval:vi.fn()}));
import {requireAppointmentRequestProvider,recordGuardianAppointmentApproval} from '../guardianAppointments.service.js';
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import { queueAppointmentWaiver } from '../appointmentWaiver.service.js';
import { attachAppointmentChangeNotes } from '../appointmentChangeNote.service.js';
import { runSignedAppointmentChange, saveAppointmentChangeDraft } from '../appointmentChangeWorkflow.service.js';
let row, conn, previewChange, applyChange;
const facts = { eventType: 'canceled', signatureConfirmed: true };
const actor = { actorUserId: 8, actorRole: 'provider' };
const run = () => runSignedAppointmentChange(1, facts, actor, { previewChange, applyChange });
beforeEach(() => {
  vi.clearAllMocks(); row = null;
  Appointment.findById.mockResolvedValue({ id: 1, agencyId: 2, status: 'confirmed' });
  previewChange = vi.fn().mockResolvedValue({ eventType: 'canceled' });
  applyChange = vi.fn().mockResolvedValue({ ok: true, narrative: 'Canceled.' });
  attachAppointmentChangeNotes.mockResolvedValue([{ id: 3, clinicalSessionId: 4, clientId: 5 }]);
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, values) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.startsWith('SELECT *')) return [[row].filter(Boolean)];
    if (sql.includes("VALUES (?, ?, 'completing'")) row = { status: 'completing', facts_json: values[2], preview_json: values[3], signed_at: values[4], signed_by_user_id: values[5] };
    else if (sql.startsWith('INSERT')) row = { status: 'draft', facts_json: values[2] };
    if (sql.startsWith('UPDATE')) {
      row.result_json = values[0]; row.narrative = values[1];
      if (sql.includes("status = 'completed'")) row.status = 'completed';
    }
    return [{ affectedRows: 1 }];
  }) };
  pool.getConnection.mockResolvedValue(conn);
});
describe('durable appointment change', () => {
  it('requires billing reconciliation before applying an appointment change with a started copay',async()=>{
    suppressAppointmentAttendanceCopays.mockRejectedValueOnce(Object.assign(new Error('A copay payment has already started'),{status:409}));
    await expect(run()).rejects.toMatchObject({status:409});
    expect(applyChange).not.toHaveBeenCalled();expect(attachAppointmentChangeNotes).not.toHaveBeenCalled();expect(row).toBe(null);
  });
  it('cannot apply a guardian request when the assigned provider has not approved',async()=>{
    requireAppointmentRequestProvider.mockRejectedValueOnce(Object.assign(new Error('Assigned provider required'),{status:403}));
    await expect(run()).rejects.toMatchObject({status:403});
    expect(applyChange).not.toHaveBeenCalled();expect(recordGuardianAppointmentApproval).not.toHaveBeenCalled();
  });
  it('retries recording guardian approval without applying the signed change twice',async()=>{
    recordGuardianAppointmentApproval.mockRejectedValueOnce(new Error('Decision unavailable'));
    await expect(run()).rejects.toThrow('Decision unavailable');
    await run();expect(applyChange).toHaveBeenCalledOnce();expect(recordGuardianAppointmentApproval).toHaveBeenCalledTimes(2);
  });
  it('saves a draft without consequences or signing', async () => {
    expect(await saveAppointmentChangeDraft(1, facts, 8)).toMatchObject({ status: 'draft', facts });
    expect(applyChange).not.toHaveBeenCalled(); expect(attachAppointmentChangeNotes).not.toHaveBeenCalled();
  });
  it('requires signature confirmation', async () => {
    await expect(runSignedAppointmentChange(1, {}, actor, { previewChange, applyChange })).rejects.toThrow('confirm your signature');
  });
  it('repeated completion returns the same signed note', async () => {
    const first = await run(); expect(await run()).toEqual(first);
    expect(first).toMatchObject({ noteId: 3, sessionNote: { isBillable: false, signedByUserId: 8 } });
    expect(applyChange).toHaveBeenCalledOnce(); expect(attachAppointmentChangeNotes).toHaveBeenCalledOnce();
  });
  it('retries note storage without repeating applied consequences', async () => {
    attachAppointmentChangeNotes.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(run()).rejects.toThrow('storage unavailable'); expect(row.status).toBe('completing');
    expect(await run()).toMatchObject({ ok: true, noteId: 3 });
    expect(applyChange).toHaveBeenCalledOnce(); expect(previewChange).toHaveBeenCalledOnce();
  });
  it('sends cancellation notifications only after the signed client note is stored', async () => {
    const notifyChange = vi.fn(async () => ({ sent: 1 }));
    attachAppointmentChangeNotes.mockRejectedValueOnce(new Error('note unavailable'));
    await expect(runSignedAppointmentChange(1, facts, actor, { previewChange, applyChange, notifyChange })).rejects.toThrow('note unavailable');
    expect(notifyChange).not.toHaveBeenCalled();
    const result = await runSignedAppointmentChange(1, facts, actor, { previewChange, applyChange, notifyChange });
    expect(result.notificationDelivery).toEqual({ sent: 1 });
    expect(notifyChange).toHaveBeenCalledWith(1, facts, actor.actorUserId);
    expect(applyChange).toHaveBeenCalledOnce();
  });
  it('retries queue creation after signing without applying the consequence again', async () => {
    queueAppointmentWaiver.mockRejectedValueOnce(new Error('queue storage unavailable'));
    await expect(run()).rejects.toThrow('queue storage unavailable');
    expect(row.status).toBe('completing');
    expect(await run()).toMatchObject({ ok: true });
    expect(applyChange).toHaveBeenCalledOnce();
    expect(queueAppointmentWaiver).toHaveBeenCalledTimes(2);
  });
  it('prevents overwriting signed documentation with a draft', async () => {
    await run(); await expect(saveAppointmentChangeDraft(1, facts, 8)).rejects.toThrow('already been signed');
  });
  it('preserves a completed clinical session', async () => {
    Appointment.findById.mockResolvedValue({ id: 1, agencyId: 2, status: 'completed' });
    await expect(run()).rejects.toThrow('final outcome'); expect(applyChange).not.toHaveBeenCalled();
  });
  it('allows a reviewed cancellation request to go through signing instead of treating it as final', async () => {
    Appointment.findById.mockResolvedValue({ id: 1, agencyId: 2, status: 'cancellation_requested' });
    expect(await run()).toMatchObject({ ok: true }); expect(applyChange).toHaveBeenCalledOnce();
  });
});

it('does not sign or cancel when reserving the support hour fails', async () => {
  const prepareChange = vi.fn().mockRejectedValue(new Error('Insufficient support hours'));
  await expect(runSignedAppointmentChange(1, facts, actor, {previewChange, applyChange, prepareChange})).rejects.toThrow('Insufficient');
  expect(suppressAppointmentAttendanceCopays.mock.calls.every(args=>args[2]?.checkOnly===true)).toBe(true);
  expect(conn.rollback).toHaveBeenCalledOnce(); expect(conn.commit).not.toHaveBeenCalled();
  expect(row).toBeNull(); expect(applyChange).not.toHaveBeenCalled();
});
it('reserves the support request once alongside signing, including note-storage retries', async () => {
  const prepareChange = vi.fn();
  attachAppointmentChangeNotes.mockRejectedValueOnce(new Error('notes unavailable'));
  const options = {previewChange, applyChange, prepareChange};
  await expect(runSignedAppointmentChange(1, facts, actor, options)).rejects.toThrow('notes unavailable');
  await runSignedAppointmentChange(1, facts, actor, options);
  expect(prepareChange).toHaveBeenCalledOnce(); expect(conn.commit).toHaveBeenCalledOnce();
  expect(applyChange).toHaveBeenCalledOnce();
});
