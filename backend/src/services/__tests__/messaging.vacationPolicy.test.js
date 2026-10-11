import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), planned: vi.fn(), memberships: vi.fn(), agency: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/PlannedOut.model.js', async importOriginal => ({ ...(await importOriginal()), default: { findById: m.planned } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.memberships } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
import { vacationTemplates, validateVacationTemplate, renderVacationTemplate, responderState, escapeReplyHtml } from '../vacationResponderPolicy.js';
import { saveVacationConfig, activePlannedOut, claimVacationReply, saveVacationDefaults, resolveVacation } from '../vacationResponder.service.js';
import { vacationAccess } from '../../controllers/vacationResponder.controller.js';
import { buildMimeMessage } from '../unifiedEmail/mime.js';
const now = new Date('2026-10-10T18:00:00Z');
const po = { id: 4, agency_id: 2, user_id: 7, status: 'approved', availability: 'unavailable', all_day: false, start_at: '2026-10-10 12:00:00', end_at: '2026-10-15 12:00:00' };
const input = { enabled: true, plannedOutId: 4, timeZone: 'America/Denver', endsLocal: '2026-10-15T09:00', templateKey: 'provider_denver', messageTemplate: '' };
beforeEach(() => { vi.clearAllMocks(); m.execute.mockResolvedValue([{ affectedRows: 1 }]); m.planned.mockResolvedValue({ ...po }); m.memberships.mockResolvedValue([{ id: 2, agency_role: 'provider' }]); m.agency.mockResolvedValue({ id: 2, name: 'Test' }); });
describe('Vacation boundaries', () => {
  it('requires opt-in, active absence, and an unexpired end', () => {
    const c = { enabled: true, endsAt: '2026-10-15T15:00:00Z' };
    expect(responderState(c, true, now)).toBe('active');
    expect(responderState(c, false, now)).toBe('waiting');
    expect(responderState({ ...c, enabled: false }, true, now)).toBe('off');
    expect(responderState(c, true, new Date(c.endsAt))).toBe('expired');
  });
  it('uses the same approved, tenant-owned unavailable absence', async () => {
    expect(await activePlannedOut(2, 7, 4, now)).toMatchObject({ id: 4 });
    expect(await activePlannedOut(3, 7, 4, now)).toBeNull();
    expect(await activePlannedOut(2, 8, 4, now)).toBeNull();
    for (const patch of [{ status: 'pending' }, { status: 'rejected' }, { availability: 'available' }]) {
      m.planned.mockResolvedValue({ ...po, ...patch }); expect(await activePlannedOut(2, 7, 4, now)).toBeNull();
    }
  });
  it('reports ended or removed absences as inactive even if the chosen responder date is later', async () => {
    m.execute.mockResolvedValue([[{ enabled: 1, planned_out_id: 4, ends_at: '2026-10-20 15:00:00', time_zone: 'America/Denver' }]]);
    expect((await resolveVacation(2, 7, new Date('2026-10-16T18:00:00Z'))).state).toBe('inactive');
    m.planned.mockResolvedValue(null);
    expect((await resolveVacation(2, 7, now)).state).toBe('inactive');
  });
  it('uses Colorado midnight boundaries for all-day absences', async () => {
    m.planned.mockResolvedValue({ ...po, all_day: true, start_date: '2026-10-10', end_date: '2026-10-11' });
    expect(await activePlannedOut(2, 7, 4, new Date('2026-10-10T05:59:59Z'))).toBeNull();
    expect(await activePlannedOut(2, 7, 4, new Date('2026-10-10T06:00:00Z'))).toMatchObject({ id: 4 });
    expect(await activePlannedOut(2, 7, 4, new Date('2026-10-11T06:00:00Z'))).toBeNull();
  });
  it('saves Colorado wall time as UTC without changing planned outs', async () => {
    await saveVacationConfig(2, 7, input, now);
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_email_vacation_responders'), [2, 7, 4, '2026-10-15 15:00:00', 'America/Denver', 'provider_denver', null]);
    expect(m.execute).toHaveBeenCalledTimes(1);
  });
  it.each([{ endsLocal: '' }, { endsLocal: '2026-10-01T12:00' }, { endsLocal: '2027-03-14T02:30' }, { timeZone: 'Unknown' }, { templateKey: 'unknown' }, { messageTemplate: 'No return placeholder' }])('rejects invalid configuration %j', async patch => { await expect(saveVacationConfig(2, 7, { ...input, ...patch }, now)).rejects.toMatchObject({ status: 400 }); expect(m.execute).not.toHaveBeenCalled(); });
  it('cannot save someone else’s or another company’s absence', async () => {
    await expect(saveVacationConfig(3, 7, input, now)).rejects.toMatchObject({ status: 400 });
    await expect(saveVacationConfig(2, 8, input, now)).rejects.toMatchObject({ status: 400 });
  });
  it('always permits switching off after deletion or expiration', async () => {
    m.planned.mockResolvedValue(null); await saveVacationConfig(2, 7, { enabled: false }, now);
    expect(m.planned).not.toHaveBeenCalled(); expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('SET enabled = 0'), [2,7]);
  });
  it('does not mistake a duplicate claim for permission to send', async () => {
    m.execute.mockResolvedValue([{ affectedRows: 0 }]); expect(await claimVacationReply(2, 7, 'test@example.test', now)).toBeNull();
    m.execute.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([{ affectedRows: 1 }]); expect(await claimVacationReply(2,7,'test@example.test',now)).toHaveProperty('hash');
  });
});
describe('Templates and access', () => {
  it('provides distinct regional provider/staff copy with no false monitoring promise', () => {
    const t = vacationTemplates(); expect(Object.keys(t)).toHaveLength(4);
    expect(t.provider_denver).toContain('4353 E. Colfax'); expect(t.provider_denver).not.toContain('Parkside');
    expect(t.staff_colorado_springs).toContain('115 S. Parkside'); expect(t.staff_colorado_springs).toContain('Employees');
    for (const v of Object.values(t)) { expect(validateVacationTemplate(v)).toBe(v); expect(v).toContain('988'); expect(v).toContain('911'); expect(v).not.toContain('844) 572-6086'); }
    expect(renderVacationTemplate('{provider_name} {return_at}', { provider_name: 'A $&', return_at: 'Monday' })).toBe('A $& Monday');
    expect(escapeReplyHtml('<script>\nHello')).toBe('<p>&lt;script&gt;<br/>Hello</p>');
  });
  it('adds loop-suppression headers only for automatic replies', () => {
    const opts = { to: 'a@example.test', from: 'b@example.test', subject: 'Away', text: 'Reply' };
    expect(buildMimeMessage({ ...opts, autoSubmitted: true })).toContain('Auto-Submitted: auto-replied');
    expect(buildMimeMessage(opts)).not.toContain('Auto-Submitted:');
  });
  it('requires agency membership even for ordinary administrators', async () => {
    const req = { user: { id: 7, role: 'admin' }, query: { agencyId: 3 }, body: {} };
    await expect(vacationAccess(req)).rejects.toMatchObject({ status: 403 });
    req.query.agencyId = 2; await expect(vacationAccess(req, true)).rejects.toMatchObject({ status: 403 });
    req.user.role = 'super_admin'; expect(await vacationAccess(req, true)).toHaveProperty('canManageDefaults', true);
    req.user.role = 'client'; await expect(vacationAccess(req)).rejects.toMatchObject({ status: 403 });
  });
  it('validates every agency template before writing', async () => {
    await expect(saveVacationDefaults({ id: 2 }, 7, { supportContact: 'support@test.test', templates: { provider_denver: 'Hello {return_at}' } })).rejects.toMatchObject({ status: 400 }); expect(m.execute).not.toHaveBeenCalled();
  });
});
