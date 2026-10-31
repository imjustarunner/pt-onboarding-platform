import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { loadSchoolSupportDraftGrounding, schoolSupportRecordReply, schoolSupportClientReferences, validateSchoolSupportReply } from '../schoolSupportDraftGrounding.service.js';

const now = new Date('2026-10-31T16:00:00Z');
const ticket = { id: 551, agency_id: 450, school_organization_id: 451, created_by_user_id: 1465,
  question: 'When will SAGQAS be seen next, and by whom?' };
function fixture(overrides = {}) {
  const state = { clients: [{ id: 2274, agency_id: 450, organization_id: 451, initials: 'SAGQAS', identifier_code: '304920',
    status: 'PACKET', document_status: 'UPLOADED', provider_id: 1433, service_day: 'Thursday', roi_expires_at: '2027-10-26', timezone: 'America/Denver' }],
    assignments: [{ id: 1433, first_name: 'Avery', last_name: 'Morgan QA', service_day: 'Thursday' }],
    plans: [], appointments: [], pastAppointments: [], recipient: [{ id: 1465, role: 'school_staff', is_school_admin: 1 }],
    roi: [{ access_level: 'roi', is_active: 1 }], member: [{ active: 1 }], ...overrides };
  const calls = [];
  return { calls, state, database: { execute: async (sql, params) => {
    calls.push([sql, params]);
    if (overrides.fail?.(sql)) throw Error('Lookup unavailable');
    if (sql.includes('FROM clients c')) return [state.clients];
    if (sql.includes('SELECT 1 AS active FROM client_organization_assignments')) return [state.member];
    if (sql.includes('FROM client_provider_assignments')) return [state.assignments];
    if (sql.includes('FROM soft_schedule_slots')) return [state.plans];
    if (sql.includes('FROM appointments ap')) return [sql.includes("ap.status='completed'") ? state.pastAppointments : state.appointments];
    if (sql.includes('FROM users u\n      JOIN user_agencies')) return [state.recipient];
    if (sql.includes('FROM client_school_staff_roi_access')) return [state.roi];
    if (sql.includes('SELECT u.id,u.first_name,u.last_name FROM users')) return [[{ id: 1433, first_name: 'Avery', last_name: 'Morgan QA' }]];
    throw Error('Unexpected SQL: ' + sql);
  } } };
}
const load = (f, more = {}) => loadSchoolSupportDraftGrounding({ ticket, ...more }, { database: f.database, now });

describe('current school administrative evidence for support drafts', () => {
  it('resolves an exact initials reference without linking or changing the ticket or using clinical note content', async () => {
    const f = fixture(); const original = structuredClone(ticket); const g = await load(f);
    expect(g).toMatchObject({ status: 'matched', matchReason: 'unique_school_reference', client: { id: 2274, initials: 'SAGQAS' }, canShareScheduling: true });
    expect(ticket).toEqual(original);
    expect(f.calls[0][1].slice(0, 3)).toEqual([450, 451, 451]);
    expect(f.calls.every(([sql]) => /^SELECT/.test(sql.trim()))).toBe(true);
    expect(f.calls.map(([sql]) => sql).join('\n')).not.toMatch(/clinical_notes|client_notes|progress_notes|full_name|email_ciphertext/i);
    expect(schoolSupportRecordReply(g)).toContain('SAGQAS is assigned to Avery Morgan QA on Thursdays');
    expect(schoolSupportRecordReply(g)).toContain('No upcoming booked school appointment');
    expect(schoolSupportRecordReply(g)).not.toMatch(/304920|2274|what.*SAGQAS.*refer/i);
  });
  it('never resolves from a historical answer, internal note, or model extraction', () => {
    expect(schoolSupportClientReferences({ question: 'Please check this.', ai_draft_metadata_json: { extractedClientReferences: ['SAGQAS'] } },
      [{ body: 'SAGQAS', is_internal: 1 }, { body: 'DANQAO', is_deleted: 1 }, { body: 'BLAQAS', author_role: 'support' }])).toEqual([]);
  });
  it('does not mistake dates, ticket numbers, phone numbers or ROI for a numeric client reference', () => {
    expect(schoolSupportClientReferences({ question: 'Ticket 551: ROI from 2026, call 6189107000.' })).toEqual([]);
    expect(schoolSupportClientReferences({ question: 'Please check student code 304920.' })).toEqual(['304920']);
  });
  it('does not choose an ambiguous initials match or search another school/agency for a fallback', async () => {
    const f = fixture(); f.state.clients.push({ ...f.state.clients[0], id: 999 });
    expect(await load(f)).toMatchObject({ status: 'ambiguous', client: null });
    expect(f.calls).toHaveLength(1);
    const outside = fixture({ clients: [{ ...f.state.clients[0], agency_id: 999 }] });
    expect(await load(outside)).toMatchObject({ status: 'not_found', client: null });
    expect(outside.calls).toHaveLength(1);
    expect(outside.calls[0][0]).toContain('c.agency_id=?');
    expect(outside.calls[0][0]).toContain('coa.organization_id=?');
  });
  it('requires an actual active school membership for a client whose primary organization differs', async () => {
    const f = fixture({ member: [] }); f.state.clients[0].organization_id = 452;
    expect(await load(f)).toMatchObject({ status: 'unavailable', client: null, warnings: ['client_school_membership_unconfirmed'] });
  });
  it('explains the ROI and current expiration plus individual release status without guessing that a renewal was completed', async () => {
    const f = fixture(); f.state.clients[0].initials = 'DANQAO';
    const g = await load(f, { ticket: { ...ticket, question: "Has DANQAO's ROI been renewed? It shows No ROI / expired." } });
    expect(schoolSupportRecordReply(g)).toContain('release of information (ROI)');
    expect(schoolSupportRecordReply(g)).toContain('October 26, 2027');
    expect(schoolSupportRecordReply(g)).toContain('permission to speak');
    expect(schoolSupportRecordReply(g)).toContain('does not match that current expiration date');
    expect(schoolSupportRecordReply(g)).not.toMatch(/please clarify|what.*ROI|renewed successfully/i);
  });
  it('keeps a revoked staff release distinct from a current agency expiration date', async () => {
    const f = fixture({ roi: [{ access_level: 'roi_docs', is_active: 0 }] });
    const g = await load(f, { ticket: { ...ticket, question: "Has SAGQAS's ROI been renewed?" } });
    expect(g.roi).toMatchObject({ state: 'current', staffState: 'limited' });
    expect(schoolSupportRecordReply(g)).toContain('limited school access');
    expect(schoolSupportRecordReply(g)).not.toMatch(/permission to speak and view/);
  });
  it('does not disclose the schedule to an ordinary school recipient without release access', async () => {
    const f = fixture({ recipient: [{ id: 1465, role: 'school_staff', is_school_admin: 0 }], roi: [] });
    f.state.clients[0].roi_expires_at = null;
    const g = await load(f);
    expect(g.canShareScheduling).toBe(false);
    expect(schoolSupportRecordReply(g)).toContain('does not permit sharing session details');
    expect(schoolSupportRecordReply(g)).not.toMatch(/Avery|Thursday/);
  });
  it('distinguishes a weekly plan from a booked school appointment and formats its actual Denver daylight offset', async () => {
    const f = fixture({ plans: [{ provider_user_id: 1433, first_name: 'Avery', last_name: 'Morgan QA', weekday: 'Thursday', start_time: '10:00:00', end_time: '10:45:00' }],
      appointments: [{ id: 89, start_at: '2026-11-02 16:00:00', status: 'scheduled', first_name: 'Avery', last_name: 'Morgan QA' }] });
    const g = await load(f); const reply = schoolSupportRecordReply(g);
    expect(reply).toContain('Thursday, 10:00–10:45');
    expect(reply).toContain('separate from a booked appointment');
    expect(reply).toMatch(/Monday, Nov 2.*9:00 AM MST/);
    expect(reply).not.toContain('confirmed school appointment');
    const [, params] = f.calls.find(([sql]) => sql.includes('FROM appointments ap'));
    expect(params.slice(0, 3)).toEqual([2274, 451, 450]);
  });
  it('recognizes a client-confirmed appointment without confusing it with a mere assignment', async () => {
    const f = fixture({ appointments: [{ id: 89, start_at: '2026-11-02 16:00:00', status: 'client_confirmed', first_name: 'Avery', last_name: 'Morgan QA' }] });
    const g = await load(f); const reply = schoolSupportRecordReply(g);
    expect(reply).toContain('next confirmed school appointment');
    expect(validateSchoolSupportReply(reply, g)).toEqual([]);
    expect(f.calls.find(([sql]) => sql.includes('FROM appointments ap'))[0]).toContain("'client_confirmed'");
  });
  it('answers a move request using the known client without pretending it changed the appointment', async () => {
    const f = fixture(); f.state.clients[0].initials = 'BLAQAS';
    const g = await load(f, { ticket: { ...ticket, question: "Can BLAQAS's session time be moved to after lunch?" } });
    const reply = schoolSupportRecordReply(g);
    expect(reply).toContain('BLAQAS is assigned to Avery');
    expect(reply).toContain('has not moved or approved a session');
    expect(reply).not.toMatch(/which BLAQAS|will (?:call|move|contact)/i);
    expect(validateSchoolSupportReply(reply, g)).toEqual([]);
  });
  it('answers assignment status using the initials instead of the numeric display/internal identifier', async () => {
    const f = fixture({ assignments: [] }); f.state.clients[0].initials = 'KAIQAS'; f.state.clients[0].provider_id = null;
    const g = await load(f, { ticket: { ...ticket, client_id: 2274, question: 'Is the client assigned to a provider yet?' } });
    expect(schoolSupportRecordReply(g)).toContain('KAIQAS has no active provider assignment');
    expect(schoolSupportRecordReply(g)).not.toMatch(/304920|2274/);
  });
  it('does not turn a failed assignment or appointment query into a definite unassigned/no-appointment answer', async () => {
    const f = fixture({ fail: sql => sql.includes('FROM client_provider_assignments') || sql.includes('FROM appointments ap') });
    const reply = schoolSupportRecordReply(await load(f));
    expect(reply).toContain('assignment for SAGQAS could not be verified');
    expect(reply).toContain('appointment schedule could not be verified');
    expect(reply).not.toContain('has no active provider assignment');
  });
  it('uses completed school attendance records for a past-seen question instead of treating a past booking as attendance', async () => {
    const f = fixture({ pastAppointments: [{ id: 88, start_at: '2026-10-29 16:00:00', status: 'completed', first_name: 'Avery', last_name: 'Morgan QA' }] });
    const g = await load(f, { ticket: { ...ticket, question: 'When was SAGQAS last seen, and by whom?' } });
    expect(schoolSupportRecordReply(g)).toMatch(/last recorded completed school session.*Thursday, Oct 29.*10:00 AM MDT.*Avery/);
    const [, params] = f.calls.find(([sql]) => sql.includes("ap.status='completed'"));
    expect(params.slice(0, 3)).toEqual([2274, 451, 450]);
    const empty = fixture();
    expect(schoolSupportRecordReply(await load(empty, { ticket: { ...ticket, question: 'When was SAGQAS last seen?' } }))).toContain('past calendar entry alone does not establish');
  });
  it('attributes the provider\'s Thursday reply to the conversation without treating it as a calendar confirmation', async () => {
    const f = fixture(); const messages = [{ id: 2, author_user_id: 1433, author_role: 'provider', body: 'QA reply re SQ: confirmed Thu, thanks.' }];
    const g = await load(f, { ticket: { ...ticket, client_id: 2274, question: 'Can we confirm Thu session time?' }, messages });
    const reply = schoolSupportRecordReply(g);
    expect(reply).toContain('Avery Morgan QA confirmed the Thu session for SAGQAS in this conversation');
    expect(reply).toContain('No upcoming booked school appointment');
    expect(reply).toContain('separate evidence');
    expect(validateSchoolSupportReply(reply, g, messages)).toEqual([]);
  });
});

describe('reject unsafe or ungrounded school-support drafts', () => {
  const grounding = { status: 'matched', client: { id: 2279, initials: 'KAIQAS', identifier_code: '209702' }, nextAppointment: null };
  it.each(['Avery Morgan QA will call the office about the room change.', 'We will move the session after lunch.', 'They will contact the guardian.'])(
    'rejects a proposed action turned into a commitment: %s', reply => expect(validateSchoolSupportReply(reply, grounding)).toContain('unsupported_provider_or_staff_commitment'));
  it.each(['Client 209702 is not yet assigned.', 'Client 2279 is waiting.'])(
    'rejects numeric identifiers: %s', reply => expect(validateSchoolSupportReply(reply, grounding)).toContain('internal_client_identifier'));
  it.each(["Could you please clarify what ROI refers to?", 'What does ROI mean?'])(
    'does not ask for the known ROI definition: %s', reply => expect(validateSchoolSupportReply(reply, grounding)).toContain('asks_known_roi_definition'));
  it('rejects an unsupported appointment confirmation but permits an honest internal review suggestion', () => {
    expect(validateSchoolSupportReply('The appointment is confirmed.', grounding)).toContain('unverified_appointment_change');
    expect(validateSchoolSupportReply('I can review the room-change request with the current school schedule.', grounding)).toEqual([]);
  });
});
