import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), mailbox: vi.fn(), send: vi.fn(), create: vi.fn(), add: vi.fn(), updateMessage: vi.fn(), update: vi.fn(), link: vi.fn(), participant: vi.fn(), find: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ resolveMessagesSendMailbox: m.mailbox }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: { create: m.create, addMessage: m.add, updateMessage: m.updateMessage, update: m.update, upsertLink: m.link, upsertParticipant: m.participant, findById: m.find } }));
import { DEFAULT_SCHOOL_CONTACT_TEMPLATE as template, getSchoolContactPlan, saveSchoolContactPlan, sendSchoolContactEmail, sendSchoolContactExample, isSchoolContactDemoAgency, renderSchoolContactTemplate, validateSchoolContactTemplate, schoolContactRouting } from '../schoolContactPlan.service.js';
const agency = { id: 450, name: 'ITSCOLLC', slug: 'auricwell-qa-demo', is_active: 1, is_archived: 0, feature_flags: { googleSsoEnabled: true } };
const provider = { id: 1433, first_name: 'Avery', last_name: 'Demo', role: 'provider', email: 'avery@example.com', work_mailbox_email: 'qaproviderauricwell@itsco.health', personal_email: 'private@example.com', sso_password_override: 0, login_is_group_email: 0 };
const input = { agencyId: 450, userId: 1433 };
let plan;
beforeEach(() => {
  vi.clearAllMocks(); plan = undefined;
  m.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT id,name,slug')) return [[agency]];
    if (sql.startsWith('SELECT u.id')) return [[provider]];
    if (sql.startsWith('SELECT DISTINCT s.id')) return [[{ id: 451, name: 'Cedar Grove K-8' }]];
    if (sql.startsWith('SELECT * FROM school_provider_contact_plans')) return [[plan].filter(Boolean)];
    if (sql.startsWith('SELECT status,decided_at FROM school_provider_contact_plans')) return [[{ status: plan?.status || 'enabled', decided_at: plan?.decided_at || '2026-10-30T15:00:00Z' }]];
    if (sql.startsWith('SELECT plan_decided_at FROM school_contact_workflows')) return [[{ plan_decided_at: '2026-10-30T15:00:00Z' }]];
    if (sql.startsWith('SELECT from_email')) return [[{ from_email: 'messages@itsco.health' }]];
    if (sql.startsWith('SELECT c.id')) return [[{ id: 999 }]];
    return [{ affectedRows: 1 }];
  });
  m.mailbox.mockResolvedValue({ identity: { id: 1116, agency_id: 450, from_email: 'messages@itsco.health' }, inbox: { id: 223914 }, fromEmail: 'messages@itsco.health' });
  m.create.mockResolvedValue({ id: 800 }); m.add.mockResolvedValue(801); m.updateMessage.mockResolvedValue({}); m.update.mockResolvedValue({});
  m.send.mockResolvedValue({ id: 'gmail-1', internetMessageId: '<sent@itsco.health>', threadId: 'gmail-thread' });
});
it('gates the pilot to the active exact demo, including when names or ids are spoofed', async () => {
  expect(isSchoolContactDemoAgency(agency)).toBe(true);
  for (const change of [{ id: 2 }, { slug: 'demo-itsco' }, { is_active: 0 }, { is_archived: 1 }]) expect(isSchoolContactDemoAgency({ ...agency, ...change })).toBe(false);
  m.execute.mockResolvedValue([[{ ...agency, id: 2 }]]);
  expect(await getSchoolContactPlan({ agencyId: 2, userId: 1433 })).toEqual({ eligible: false, demoOnly: true });
  await expect(saveSchoolContactPlan({ agencyId: 2, userId: 1433 }, { status: 'enabled' })).rejects.toMatchObject({ status: 403 });
  expect(m.send).not.toHaveBeenCalled();
});
it('requires active provider membership and an assigned school', async () => {
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT id,name,slug') ? [[agency]] : [[]]);
  await expect(saveSchoolContactPlan(input, { status: 'enabled' })).rejects.toMatchObject({ status: 403 });
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
it('resolves a demo school through its verified pilot affiliation without granting other schools access', async () => {
  const original = m.execute.getMockImplementation();
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT id,name,slug') && args[0] === 451) return [[{ id: 451, slug: 'auricwell-qa-demo-school', organization_type: 'school', is_active: 1, is_archived: 0 }]];
    if (sql.startsWith('SELECT a.id')) return [[agency]];
    return original(sql, args);
  });
  expect(await getSchoolContactPlan({ agencyId: 451, userId: 1433 })).toMatchObject({ eligible: true, agencyId: 450 });
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('oa.agency_id=? AND oa.is_active=1'), [451, 450]);
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT id,name,slug') ? [[{ id: 22, organization_type: 'school', is_active: 1 }]] : [[]]);
  expect(await getSchoolContactPlan({ agencyId: 22, userId: 1433 })).toEqual({ eligible: false, demoOnly: true });
  await expect(saveSchoolContactPlan({ agencyId: 22, userId: 1433 }, { status: 'enabled' })).rejects.toMatchObject({ status: 403 });
});
it('returns a rendered preview, persisted choices and actual SSO mailbox copy address', async () => {
  const state = await getSchoolContactPlan(input);
  expect(state).toMatchObject({ eligible: true, demoOnly: true, status: 'unconfigured', smsAfterDays: 3, emailAfterDays: 7, staleAfterHours: 72,
    routing: { isSso: true, providerEmail: 'qaproviderauricwell@itsco.health', replyTo: 'messages@itsco.health' } });
  expect(state.preview.body).toContain('Avery Demo'); expect(state.preview.body).toContain('Example Middle School');
});
it('constrains editable text and renders no arbitrary placeholders or HTML', () => {
  expect(validateSchoolContactTemplate(template)).toBe(template);
  expect(() => validateSchoolContactTemplate(template.replace('{{school_name}}', 'School'))).toThrow('school_name');
  expect(() => validateSchoolContactTemplate(`${template}\n{{secret}}`)).toThrow('four supported');
  expect(() => validateSchoolContactTemplate(`${template}<script>alert(1)</script>`)).toThrow('plain text');
  expect(renderSchoolContactTemplate(template, { parent_name: 'Alex', provider_name: 'Avery', school_name: 'Cedar', service_day: 'Monday' })).toContain('Alex,');
});
it('persists decline and preserves the opt-in cutoff when editing an enabled plan', async () => {
  await saveSchoolContactPlan(input, { status: 'declined' });
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO school_provider_contact_plans'), [450, 1433, 'declined', template, 3, 7, 72, expect.any(Date)]);
  const cutoff = new Date('2026-10-30T15:00:00Z'); plan = { status: 'enabled', template, decided_at: cutoff };
  await saveSchoolContactPlan(input, { status: 'enabled', smsAfterDays: 4 });
  const insert = m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO school_provider_contact_plans')).at(-1);
  expect(insert[1]).toEqual([450, 1433, 'enabled', template, 4, 7, 72, cutoff]);
});
it('validates follow-up order and whole-number timing', async () => {
  for (const body of [{ smsAfterDays: 7, emailAfterDays: 5 }, { staleAfterHours: 0 }, { smsAfterDays: 1.5 }]) await expect(saveSchoolContactPlan(input, { status: 'enabled', ...body })).rejects.toMatchObject({ status: 400 });
});
it('supports future mandated providers without enabling other tenants', async () => {
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT id,name,slug') ? [[{ ...agency, feature_flags: { schoolContactPlanRequiredProviderIds: [1433] } }]] : sql.startsWith('SELECT u.id') ? [[provider]] : sql.startsWith('SELECT DISTINCT s.id') ? [[{ id: 451 }]] : [[]]);
  await expect(saveSchoolContactPlan(input, { status: 'declined' })).rejects.toMatchObject({ status: 409 });
});
it('sends an example through messages with all physical recipients restricted and no client links', async () => {
  expect(await sendSchoolContactExample(input, { template })).toMatchObject({ sent: true, example: true, deliveredTo: 'testing@itsco.health', conversationId: 800 });
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 1116, to: 'testing@itsco.health', cc: 'testing@itsco.health', bcc: 'testing@itsco.health', source: 'auto', clientId: null,
    fromDisplayNameOverride: 'Avery Demo', replyToOverride: expect.stringMatching(/^messages\+[a-f0-9]{36}@itsco.health$/) }));
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({ isAutoReply: true, autoReplyKind: 'school_contact_example', to: [{ email: 'testing@itsco.health' }], cc: [{ email: 'qaproviderauricwell@itsco.health' }] }));
  expect(m.link).not.toHaveBeenCalled();
});
it('records logical guardian contact and provider BCC while sandboxing the real transport', async () => {
  await sendSchoolContactEmail({ agencyId: 450, providerUserId: 1433, clientId: 999, schoolId: 451, to: 'parent@example.com', parentName: 'Alex', schoolName: 'Cedar Grove', serviceDay: 'Monday', workflowId: 3, stepKey: 'initial_email' });
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({ authorUserId: 1433, to: [{ email: 'parent@example.com' }], bcc: [{ email: 'qaproviderauricwell@itsco.health' }], isAutoReply: false, internetMessageId: '<school-contact-3-initial_email@itsco.health>' }));
  expect(m.link).toHaveBeenCalledWith(800, 'client', 999, 'Automated school contact plan');
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'testing@itsco.health', cc: null, bcc: 'testing@itsco.health', internetMessageIdOverride: '<school-contact-3-initial_email@itsco.health>' }));
});
it('routes nonSSO replies to their email and discloses external reply tracking limits', () => {
  expect(schoolContactRouting({ ...provider, sso_password_override: 1 }, undefined, agency)).toMatchObject({ isSso: false, replyTo: 'private@example.com', replyTracking: 'external_email' });
  expect(schoolContactRouting(provider, undefined, { ...agency, feature_flags: {} })).toMatchObject({ isSso: false, replyTo: 'private@example.com', replyTracking: 'external_email' });
});
it('does not mark queued or failed delivery as contact', async () => {
  m.send.mockResolvedValue({ queued: true });
  await expect(sendSchoolContactExample(input, { template })).rejects.toMatchObject({ status: 502 });
  expect(m.updateMessage).toHaveBeenCalledWith(801, { sendStatus: 'failed' });
  expect(m.updateMessage.mock.calls.some(([, value]) => value.sendStatus === 'sent')).toBe(false);
});
it('rechecks opt-in immediately before sending a prepared client message', async () => {
  plan = { status: 'declined' };
  await expect(sendSchoolContactEmail({ agencyId: 450, providerUserId: 1433, clientId: 999, schoolId: 451, to: 'parent@example.com' })).rejects.toMatchObject({ status: 409 });
  expect(m.send).not.toHaveBeenCalled();
  expect(m.updateMessage).toHaveBeenCalledWith(801, { sendStatus: 'failed' });
});
it('does not send an old workflow after the provider reenrolls during message preparation', async () => {
  plan = { status: 'enabled', decided_at: '2026-10-31T15:00:00Z' };
  await expect(sendSchoolContactEmail({ agencyId: 450, providerUserId: 1433, clientId: 999, schoolId: 451, to: 'parent@example.com', workflowId: 3, stepKey: 'initial_email' })).rejects.toMatchObject({ status: 409 });
  expect(m.send).not.toHaveBeenCalled();
});
it('retains accepted delivery evidence without resending if recording fails', async () => {
  m.updateMessage.mockRejectedValue(new Error('database transient failure'));
  expect(await sendSchoolContactExample(input, { template })).toMatchObject({ sent: true, recordPending: true });
  expect(m.send).toHaveBeenCalledTimes(1);
});
