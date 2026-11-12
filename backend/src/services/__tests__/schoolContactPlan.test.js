import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), mailbox: vi.fn(), send: vi.fn(), create: vi.fn(), add: vi.fn(), updateMessage: vi.fn(), update: vi.fn(), link: vi.fn(), participant: vi.fn(), find: vi.fn() }));
vi.mock('../schoolContactReplyRouting.service.js',()=>({schoolContactWorkMailboxAvailable:vi.fn(async()=>true)}));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../familyWelcomeAssets.service.js', () => ({ providerProfileUrl: (_agency, owner) => `https://app.example/auricwell-qa-demo/provider/${owner.id}`, buildProviderIntroductionPdf: vi.fn(async () => Buffer.from('%PDF-1.7')), introductionPdfAttachment: pdf => ({ filename: 'School introduction.pdf', contentType: 'application/pdf', contentBase64: pdf.toString('base64') }) }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ resolveMessagesSendMailbox: m.mailbox }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: { create: m.create, addMessage: m.add, updateMessage: m.updateMessage, update: m.update, upsertLink: m.link, upsertParticipant: m.participant, findById: m.find } }));
import { DEFAULT_SCHOOL_CONTACT_TEMPLATE as template, getSchoolContactPlan, saveSchoolContactPlan, sendSchoolContactEmail, sendSchoolContactExample, buildFamilyWelcomePdfPreview, isSchoolContactDemoAgency, renderSchoolContactTemplate, validateSchoolContactTemplate, schoolContactRouting } from '../schoolContactPlan.service.js';
import {schoolContactWorkMailboxAvailable} from '../schoolContactReplyRouting.service.js';
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
    if (sql.startsWith('SELECT include_pdf')) return [[plan ? { include_pdf: plan.include_pdf ?? 1 } : undefined].filter(Boolean)];
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
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('oa.agency_id IN (?,?) AND oa.is_active=1'), [451, 450, 2]);
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT id,name,slug') ? [[{ id: 22, organization_type: 'school', is_active: 1 }]] : [[]]);
  expect(await getSchoolContactPlan({ agencyId: 22, userId: 1433 })).toEqual({ eligible: false, demoOnly: true });
  await expect(saveSchoolContactPlan({ agencyId: 22, userId: 1433 }, { status: 'enabled' })).rejects.toMatchObject({ status: 403 });
});
it('returns a rendered preview, persisted choices and actual SSO mailbox copy address', async () => {
  const state = await getSchoolContactPlan(input);
  expect(state).toMatchObject({ eligible: true, demoOnly: true, status: 'unconfigured', smsAfterDays: 2, emailAfterDays: 4, staleAfterHours: 48,
    routing: { isSso: true, providerEmail: 'qaproviderauricwell@itsco.health', replyTo: 'qaproviderauricwell@itsco.health' } });
  expect(state.preview.body).toContain('Avery Demo'); expect(state.preview.body).toContain('Cedar Grove K-8');
});
it('constrains editable text and renders no arbitrary placeholders or HTML', () => {
  expect(validateSchoolContactTemplate(template)).toBe(template);
  expect(() => validateSchoolContactTemplate(template.replace('{{school_name}}', 'School'))).toThrow('school_name');
  expect(() => validateSchoolContactTemplate(`${template}\n{{secret}}`)).toThrow('supported');
  expect(() => validateSchoolContactTemplate(`${template}<script>alert(1)</script>`)).toThrow('plain text');
  expect(renderSchoolContactTemplate(template, { parent_name: 'Alex', provider_name: 'Avery', school_name: 'Cedar', service_day: 'Monday' })).toContain('Hi Alex,');
});
it('persists decline and preserves the opt-in cutoff when editing an enabled plan', async () => {
  await saveSchoolContactPlan(input, { status: 'declined' });
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO school_provider_contact_plans'), [450,1433,'declined',template,expect.any(String),expect.any(String),expect.any(String),2,4,48,expect.any(Date),1]);
  const cutoff = new Date('2026-10-30T15:00:00Z'); plan = { status: 'enabled', template, decided_at: cutoff };
  await saveSchoolContactPlan(input, { status: 'enabled', smsAfterDays: 4 });
  const insert = m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO school_provider_contact_plans')).at(-1);
  expect(insert[1]).toEqual([450,1433,'enabled',template,expect.any(String),expect.any(String),expect.any(String),2,4,48,cutoff,1]);
});
it('uses the required48hour cadence and rejects unsafe later-contact templates',async()=>{
  await saveSchoolContactPlan(input,{status:'enabled',smsAfterDays:7,emailAfterDays:8,staleAfterHours:72});
  const insert=m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO school_provider_contact_plans')).at(-1);
  expect(insert[1].slice(7,10)).toEqual([2,4,48]);
  await expect(saveSchoolContactPlan(input,{status:'enabled',secondTemplate:'<script>unsafe</script>'})).rejects.toMatchObject({status:400});
});
it('supports future mandated providers without enabling other tenants', async () => {
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT id,name,slug') ? [[{ ...agency, feature_flags: { schoolContactPlanRequiredProviderIds: [1433] } }]] : sql.startsWith('SELECT u.id') ? [[provider]] : sql.startsWith('SELECT DISTINCT s.id') ? [[{ id: 451 }]] : [[]]);
  await expect(saveSchoolContactPlan(input, { status: 'declined' })).rejects.toMatchObject({ status: 409 });
});
it('sends an example through messages with all physical recipients restricted and no client links', async () => {
  expect(await sendSchoolContactExample(input, { template })).toMatchObject({ sent: true, example: true, deliveredTo: 'testing@itsco.health', conversationId: 800 });
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 1116, to: 'testing@itsco.health', cc: 'testing@itsco.health', bcc: 'testing@itsco.health', source: 'auto', clientId: null,
    fromDisplayNameOverride: 'Avery Demo', replyToOverride: 'qaproviderauricwell@itsco.health' }));
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({ isAutoReply: true, autoReplyKind: 'school_contact_example', to: [{ email: 'testing@itsco.health' }], cc: [{ email: 'qaproviderauricwell@itsco.health' }] }));
  expect(m.link).not.toHaveBeenCalled();
});
it('records logical guardian contact and provider BCC while sandboxing the real transport', async () => {
  await sendSchoolContactEmail({ agencyId: 450, providerUserId: 1433, clientId: 999, schoolId: 451, to: 'parent@example.com', parentName: 'Alex', schoolName: 'Cedar Grove', serviceDay: 'Monday', workflowId: 3, stepKey: 'initial_email' });
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({ authorUserId: 1433, to: [{ email: 'parent@example.com' }], bcc: [{ email: 'qaproviderauricwell@itsco.health' }], isAutoReply: false, internetMessageId: '<school-contact-3-initial_email@itsco.health>' }));
  expect(m.link).toHaveBeenCalledWith(800, 'client', 999, 'Automated school contact plan');
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'testing@itsco.health', cc: null, bcc: 'testing@itsco.health', internetMessageIdOverride: '<school-contact-3-initial_email@itsco.health>' }));
});
it('keeps the working app reply-token route when delegated access to the SSO work mailbox is unavailable',async()=>{
 schoolContactWorkMailboxAvailable.mockResolvedValueOnce(false);
 await sendSchoolContactExample(input,{template});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({replyToOverride:expect.stringMatching(/^messages\+[a-f0-9]{36}@itsco.health$/)}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO hub_email_reply_tokens'),expect.arrayContaining([450,800,1433]));
});
it('routes nonSSO replies to their email and discloses external reply tracking limits', () => {
  expect(schoolContactRouting({ ...provider, sso_password_override: 1 }, undefined, agency)).toMatchObject({ isSso: false, replyTo: 'private@example.com', replyTracking: 'external_email' });
  expect(schoolContactRouting(provider, undefined, { ...agency, feature_flags: {} })).toMatchObject({ isSso: false, replyTo: 'private@example.com', replyTracking: 'external_email' });
});
it('never guesses an SSO reply address from login or personal fields without a configured work mailbox',()=>{
 expect(schoolContactRouting({...provider,work_mailbox_email:null},undefined,agency)).toMatchObject({isSso:true,providerEmail:'',replyTo:''});
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
it('attaches the introduction PDF to the welcome email only when the provider keeps it on', async () => {
  plan = { status: 'enabled', decided_at: '2026-10-30T15:00:00Z', include_pdf: 1 };
  await sendSchoolContactEmail({ agencyId: 450, providerUserId: 1433, clientId: 999, schoolId: 451, to: 'parent@example.com', workflowId: 3, stepKey: 'initial_email' });
  expect(m.send.mock.calls.at(-1)[0].attachments).toEqual([expect.objectContaining({ filename: 'School introduction.pdf', contentType: 'application/pdf' })]);
  plan.include_pdf = 0;
  await sendSchoolContactEmail({ agencyId: 450, providerUserId: 1433, clientId: 999, schoolId: 451, to: 'parent@example.com', workflowId: 3, stepKey: 'initial_email' });
  expect(m.send.mock.calls.at(-1)[0].attachments).toBeNull();
  await sendSchoolContactEmail({ agencyId: 450, providerUserId: 1433, clientId: 999, schoolId: 451, to: 'parent@example.com', workflowId: 3, stepKey: 'final_contact', template: template.replace('{{provider_name}}', '{{provider_name}} {{profile_link}}') });
  const last = m.send.mock.calls.at(-1)[0];
  expect(last.attachments).toBeNull();
  expect(last.html).toContain('<a href="https://app.example/auricwell-qa-demo/provider/1433">');
});
it('saves the PDF choice and reports Family Welcome state', async () => {
  await saveSchoolContactPlan(input, { status: 'enabled', includePdf: false });
  const insert = m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO school_provider_contact_plans')).at(-1);
  expect(insert[1].at(-1)).toBe(0);
  plan = { status: 'enabled', template, include_pdf: 0, welcome_seen_at: new Date() };
  expect(await getSchoolContactPlan(input)).toMatchObject({ featureName: 'Family Welcome & Follow-Up', includePdf: false, welcomeSeen: true, profileUrl: 'https://app.example/auricwell-qa-demo/provider/1433' });
});


it.each(['{{parent_name', 'school_name}}', '{{unknown}}'])('rejects broken or unsupported fields before any settings write: %s', async bad => {
  await expect(saveSchoolContactPlan(input,{status:'enabled',template:template+' '+bad})).rejects.toThrow();
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO school_provider_contact_plans'))).toBe(false);
  await expect(saveSchoolContactPlan(input,{status:'enabled',smsTemplate:'Hi {{parent_name}}, this is {{provider_name}}. Please reply to arrange a meeting. '+bad})).rejects.toThrow();
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO school_provider_contact_plans'))).toBe(false);
});

it('renders edited messages separately for two providers and two schools without retaining prior names or links', async () => {
  const original=m.execute.getMockImplementation();
  m.execute.mockImplementation(async(sql,args=[])=>{
    if(sql.startsWith('SELECT u.id'))return [[{...provider,id:args[1],first_name:args[1]===1433?'Avery':'Casey',last_name:'QA'}]];
    if(sql.startsWith('SELECT DISTINCT s.id'))return [[{id:451,name:'Cedar School'},{id:452,name:'Pine School'}]];
    return original(sql,args);
  });
  for(const fixture of [{provider:1433,name:'Avery QA',school:451,schoolName:'Cedar School',parent:'Tess QA',day:'Monday'}, {provider:1438,name:'Casey QA',school:452,schoolName:'Pine School',parent:'Renée QA',day:'Friday'}]){
    await sendSchoolContactEmail({agencyId:450,providerUserId:fixture.provider,clientId:999,schoolId:fixture.school,to:'testing+fields@itsco.health',parentName:fixture.parent,schoolName:fixture.schoolName,serviceDay:fixture.day,template:template+'\nMy preferred welcome wording.',includePdf:false});
    const sent=m.send.mock.calls.at(-1)[0];
    for(const value of [fixture.name,fixture.schoolName,fixture.parent,fixture.day,`/provider/${fixture.provider}`,'My preferred welcome wording.'])expect(sent.text).toContain(value);
    expect(sent.text).not.toContain('{{');expect(sent.fromDisplayNameOverride).toBe(fixture.name);
    if(fixture.provider===1438)for(const stale of ['Avery QA','Cedar School','Tess QA','Monday','/provider/1433'])expect(sent.text).not.toContain(stale);
  }
});


it('uses the selected assigned school for emailed examples and rejects a foreign school before sending', async()=>{
  const original=m.execute.getMockImplementation();
  m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT DISTINCT s.id')?[[{id:451,name:'Cedar School'},{id:452,name:'Pine School'}]]:original(sql,args));
  await sendSchoolContactExample(input,{template,schoolId:452,schoolName:'Unrelated school',providerName:'Another provider'});
  expect(m.send.mock.calls.at(-1)[0].text).toContain('Pine School');
  expect(m.send.mock.calls.at(-1)[0].text).toContain('Avery Demo');
  expect(m.send.mock.calls.at(-1)[0].text).not.toContain('Unrelated school');
  expect(m.send.mock.calls.at(-1)[0].text).not.toContain('Another provider');
  await expect(sendSchoolContactExample(input,{template,schoolId:999})).rejects.toMatchObject({status:403});
  expect(m.send).toHaveBeenCalledTimes(1);
});

it('enables only an explicitly selected live ITSCO provider and addresses their example to their own mailbox', async () => {
  const original=m.execute.getMockImplementation();
  const live={...agency,id:2,slug:'itsco',feature_flags:{googleSsoEnabled:true,schoolContactPlanPilot:{enabled:true,providerIds:[1433]}}};
  m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT id,name,slug')?[[live]]:original(sql,args));
  m.mailbox.mockResolvedValue({identity:{id:167,agency_id:2},inbox:{id:10},fromEmail:'messages@itsco.health'});
  expect(await getSchoolContactPlan({agencyId:2,userId:1433})).toMatchObject({eligible:true,demoOnly:false,rolloutPhase:'phase_1',status:'unconfigured',welcomeSeen:false});
  await sendSchoolContactExample({agencyId:2,userId:1433},{template,schoolId:451,includePdf:false});
  expect(m.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({to:provider.work_mailbox_email,cc:null,bcc:null}));
  expect(m.send.mock.calls[0][0].text).toContain('Cedar Grove K-8');
  m.send.mockClear();
  await sendSchoolContactEmail({agencyId:2,providerUserId:1433,clientId:999,schoolId:451,to:'family@synthetic.test',parentName:'Casey',schoolName:'A different school',serviceDay:'Monday',includePdf:false});
  expect(m.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({to:'family@synthetic.test',bcc:provider.work_mailbox_email}));
  expect(m.send.mock.calls[0][0].text).toContain('Cedar Grove K-8');
  expect(m.send.mock.calls[0][0].text).not.toContain('A different school');
  live.feature_flags.schoolContactPlanPilot.providerIds=[9999];m.execute.mockClear();
  await expect(saveSchoolContactPlan({agencyId:2,userId:1433},{status:'enabled',providerUserId:9999})).rejects.toMatchObject({status:403});
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});

it('uses assigned school days in the preview and sent example without changing the actual assignment',async()=>{
 const original=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT school_organization_id,day_of_week')?[[{school_organization_id:451,day_of_week:'Tuesday'}]]:original(sql,args));
 const p=await getSchoolContactPlan(input);expect(p.schools[0]).toMatchObject({serviceDays:['Tuesday'],serviceDayLabel:'Tuesday'});expect(p.preview.body).toContain('Tuesday');expect(p.preview.body).not.toContain('Example Day');
 await sendSchoolContactExample(input,{template,schoolId:451,includePdf:false});expect(m.send.mock.calls[0][0].text).toContain('Tuesday');
 await expect(buildFamilyWelcomePdfPreview(input,999)).rejects.toMatchObject({status:403});
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE provider_school_assignments'))).toBe(false);
});

it('checks messaging setup before opting in while retaining the provider ability to choose Off',async()=>{
 const original=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT u.id')?[[{...provider,work_mailbox_email:null}]]:original(sql,args));
 expect(await getSchoolContactPlan(input)).toMatchObject({canEnable:false,setupNotice:expect.stringContaining('support setup')});
 await expect(saveSchoolContactPlan(input,{status:'enabled'})).rejects.toMatchObject({status:409});
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 await saveSchoolContactPlan(input,{status:'declined'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO school_provider_contact_plans'),expect.arrayContaining(['declined']));
});

import {displaySchoolContactDay,preferredSchoolContactTemplate} from '../schoolContactTemplates.js';
it('keeps custom wording and uses a clear pending label when the assignment day is unknown',()=>{const authored=template+'\nMy own words.';expect(preferredSchoolContactTemplate(authored)).toBe(authored);expect(displaySchoolContactDay('Unknown')).toBe('to be confirmed');expect(displaySchoolContactDay('Example day')).toBe('to be confirmed');expect(displaySchoolContactDay('Tuesday')).toBe('Tuesday');});
