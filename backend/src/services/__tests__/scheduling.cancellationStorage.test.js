import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), authorize: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({
  maybeEncryptNotePayload: value => JSON.stringify({ _enc: true, ciphertext: Buffer.from(value).toString('base64') }),
  maybeDecryptNotePayload: value => { let row; try { row = JSON.parse(value); } catch { return value; } return row?._enc ? Buffer.from(row.ciphertext, 'base64').toString() : value; }
}));
vi.mock('../appointmentStaffTools.service.js', () => ({ default: { authorize: m.authorize } }));
import { logCommunication, listCommunications } from '../appointmentReminder.service.js';
import UserCommunication from '../../models/UserCommunication.model.js';
import { getAppointmentTimeline } from '../../controllers/bookingPolicies.controller.js';
beforeEach(() => vi.resetAllMocks());
it('stores cancellation timeline content in an encrypted envelope and decrypts authorized reads', async () => {
  m.execute.mockResolvedValue([{ insertId: 1 }]);
  await logCommunication({ appointmentId: 4, agencyId: 2, kind: 'cancellation', bodyPreview: 'Reason: illness', metadata: { body: 'Reason: illness', clientId: 8 } });
  const values = m.execute.mock.calls[0][1];
  expect(values[5]).not.toContain('illness'); expect(values[6]).not.toContain('illness'); expect(JSON.parse(values[6])._enc).toBe(true);
  m.execute.mockResolvedValue([[{ id: 1, appointment_id: 4, kind: 'cancellation', body_preview: values[5], metadata_json: values[6] }]]);
  expect((await listCommunications(4))[0]).toMatchObject({ bodyPreview: 'Reason: illness', metadata: { body: 'Reason: illness', clientId: 8 } });
});
it('encrypts the saved client communication body while preserving readable legacy messages', async () => {
  m.execute.mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([[{ id: 1, template_type: 'session_cancellation', body: 'Legacy reason' }]]);
  await UserCommunication.create({ agencyId: 2, clientId: 8, templateType: 'session_cancellation', body: 'Reason: illness' });
  const values = m.execute.mock.calls[0][1]; expect(values[7]).not.toContain('illness');
  expect(UserCommunication.hydrateBody({ template_type: 'session_cancellation', body: values[7] }).body).toBe('Reason: illness');
  expect(UserCommunication.hydrateBody({ template_type: 'session_cancellation', body: 'Legacy reason' }).body).toBe('Legacy reason');
});
it('requires full staff schedule access before reading any timeline messages', async () => {
  const denied = Object.assign(new Error('Staff access required'), { status: 403 }); m.authorize.mockRejectedValue(denied);
  const next = vi.fn(), json = vi.fn(); await getAppointmentTimeline({ params: { id: '4' }, user: { id: 9, role: 'client_guardian' } }, { json }, next);
  expect(next).toHaveBeenCalledWith(denied); expect(m.execute).not.toHaveBeenCalled(); expect(json).not.toHaveBeenCalled();
});
