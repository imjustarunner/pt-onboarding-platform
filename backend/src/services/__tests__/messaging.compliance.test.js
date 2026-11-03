import {phoneFingerprint} from '../../utils/staffCommunicationChoices.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
import pool from '../../config/database.js';
import { getSmsSender, prepareSmsDelivery, processSmsKeyword, recordInboundConversation, staffAssistantReplyCapability } from '../smsCompliance.service.js';
import { parseSmsKeyword, validateSmsRegistration, validateSmsConsentEvidence } from '../../utils/smsCompliancePolicy.js';

const registration = {
  provider: 'notifyre',
  brandId: 'B123', campaignId: 'C123', resellerId: 'R123', brandName: 'ITSCO', legalName: 'ITSCO, LLC',
  supportContact: 'support@itsco.health', website: 'https://www.itsco.health', privacyUrl: 'https://www.itsco.health/privacy',
  termsUrl: 'https://www.itsco.health/terms', evidenceUrl: 'https://www.itsco.health/proof',
  purposes: ['care', 'reminders'], keywordOwner: 'application', approved: true, numberLinked: true, allowRestart: true
};
const sender = { id: 3, agency_id: 2, phone_number: '+13035550100', is_active: 1, status: 'active',
  campaign_id: 'C123', registration_json: registration, agency_name: 'ITSCO' };
const message = { from: sender.phone_number, to: '+13035550101', body: 'Your appointment is tomorrow.', purpose: 'reminders' };
let permissions;
let phoneState;
let permissionEvents;
let connection;
beforeEach(() => {
  vi.resetAllMocks();
  permissions = [];phoneState={blocked:false,command_at:0};permissionEvents=new Set();
  connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, values) => {
    if(sql.includes('SELECT blocked,command_at')) return [[phoneState]];
    if(sql.startsWith('UPDATE auricwell_sms_phone_state')) {phoneState={blocked:values[0],command_at:values[1]};return [{affectedRows:1}];}
    if(sql.startsWith('INSERT IGNORE INTO sms_permission_events')) {
      const key=JSON.stringify([values[0],values[1],values[2],values[4]]);
      const affectedRows=permissionEvents.has(key)?0:1;permissionEvents.add(key);return [{affectedRows}];
    }
    if(sql.includes("VALUES (?,?,?,'opted_out',?)")){const [scope,phone,purpose,evidence]=values;permissions=permissions.filter(p=>!(p.scope===scope&&p.phone===phone&&p.purpose===purpose));permissions.push({scope,phone,purpose,status:'opted_out',evidence_json:evidence});return [{affectedRows:1}];}
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.startsWith('SELECT status,evidence_json,expires_at')) return pool.execute(sql, values);
    if (sql.startsWith('SELECT evidence_json FROM sms_permission_events')) return [[]];
    if (sql.startsWith("UPDATE sms_recipient_permissions SET status='opted_in'")) {const [evidence,expires_at,scope,phone,purpose]=values;permissions=permissions.filter(p=>!(p.scope===scope&&p.phone===phone&&p.purpose===purpose));permissions.push({scope,phone,purpose,status:'opted_in',evidence_json:evidence,expires_at});return [{affectedRows:1}];}
    if (sql.includes('INSERT INTO sms_recipient_permissions')) {
      const [scope, phone, purpose, status, evidence, expires] = values;
      permissions = permissions.filter((p) => !(p.scope === scope && p.phone === phone && p.purpose === purpose));
      permissions.push({ scope, phone, purpose, status, evidence, expires_at: expires });
    }
    return [{}];
  }) };
  pool.getConnection.mockResolvedValue(connection);
  pool.execute.mockImplementation(async (sql, args) => {
    if(sql.includes('SELECT blocked FROM auricwell_sms_phone_state')) return [[phoneState]];
    if(sql.startsWith('SELECT status,evidence_json,expires_at')) return [permissions.filter(p=>p.scope===args[0]&&p.phone===args[1]&&p.purpose===args[2])];
    if(sql.includes('SELECT status FROM sms_recipient_permissions')) return [permissions.filter(p=>p.scope===args[0]&&p.phone===args[1]&&p.purpose===args[2])];
    if(sql.includes("SELECT status, expires_at FROM sms_recipient_permissions")) return [permissions.filter(p=>p.scope===args[0]&&p.phone===args[1]&&p.purpose==='care')];
    if (sql.includes('FROM twilio_numbers')) return [[sender]];
    if (sql.includes("purpose = 'suppression'")) return [permissions.filter((p) => [args[0], args[1]].includes(p.scope) && p.phone === args[2] && p.purpose === 'suppression' && p.status === 'opted_out')];
    if (sql.includes('FROM sms_recipient_permissions')) return [permissions.filter((p) => p.scope === args[0] && p.phone === args[1] && p.purpose === (args[2] || 'care') && p.status === 'opted_in')];
    return [[]];
  });
});

describe('campaign-wide SMS delivery gate', () => {
  it('rejects a number assigned to multiple tenants instead of selecting the first record', async () => {
    pool.execute.mockResolvedValueOnce([[sender, {...sender,id:8,agency_id:99}]]);
    await expect(getSmsSender(sender.phone_number)).rejects.toMatchObject({code:'sms_ambiguous_sender'});
  });
  it('event suppression blocks that event while preserving other consented traffic', async () => {
    const original = pool.execute.getMockImplementation();
    pool.execute.mockImplementation(async (sql, args) => {
      if (sql.includes('FROM company_events')) return [[{ id: args[0] }]];
      if (sql.includes('FROM company_event_sms_preferences')) return [Number(args[0]) === 4 ? [{ muted: 1 }] : []];
      return original(sql, args);
    });
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'reminders', status: 'opted_in' });
    await expect(prepareSmsDelivery({ ...message, companyEventId: 4 })).rejects.toMatchObject({ code: 'event_sms_muted' });
    await expect(prepareSmsDelivery({ ...message, companyEventId: 5 })).resolves.toMatchObject({ to: message.to });
    await expect(prepareSmsDelivery(message)).resolves.toMatchObject({ to: message.to });
  });
  it('rejects an event outside the sender agency even with recipient consent', async () => {
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'reminders', status: 'opted_in' });
    await expect(prepareSmsDelivery({ ...message, companyEventId: 99 })).rejects.toMatchObject({ code: 'event_sms_invalid_event' });
  });
  it('requires a separately reviewed hiring grant and never turns it into staff consent',async()=>{
    const original=pool.execute.getMockImplementation();let hiringGranted=false;
    pool.execute.mockImplementation(async(sql,args)=>{
      if(sql.includes('FROM twilio_numbers'))return [[{...sender,registration_json:{...registration,provider:'vonage',purposes:['workforce']}}]];
      if(sql.includes('FROM hire_communication_preferences'))return [hiringGranted?[{id:1}]:[]];
      return original(sql,args);
    });
    const hiring={...message,purpose:'workforce',staffNotificationKind:'hiring',hiringUserId:8,agencyId:2};
    await expect(prepareSmsDelivery(hiring)).rejects.toMatchObject({code:'sms_hiring_consent_required'});
    hiringGranted=true;
    await expect(prepareSmsDelivery(hiring)).resolves.toMatchObject({to:message.to});
    await expect(prepareSmsDelivery({...message,purpose:'workforce'})).rejects.toMatchObject({code:'sms_consent_required'});
    permissions.push({scope:'campaign:C123',phone:message.to,purpose:'suppression',status:'opted_out'});
    await expect(prepareSmsDelivery(hiring)).rejects.toMatchObject({code:'sms_opted_out'});
  });

  it('does not grandfather a self-activated staff preference into reviewed enrollment', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...sender, registration_json: { ...registration, provider: 'vonage', purposes: ['workforce'] } }]]);
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'workforce', status: 'opted_in',
      evidence_json: { reference: 'staff_communications:old-signature' } });
    await expect(prepareSmsDelivery({ ...message, purpose: 'workforce' })).rejects.toMatchObject({ code: 'sms_consent_review_required' });
  });
  it('honors separate staff categories even when workforce campaign consent exists', async () => {
    const original=pool.execute.getMockImplementation();
    pool.execute.mockImplementation(async(sql,args)=> {
      if(sql.includes('FROM twilio_numbers')) return [[{...sender,registration_json:{...registration,provider:'vonage',purposes:['workforce','polling']}}]];
      if(sql.includes('AS choices')) return [[{choices:{phoneHash:phoneFingerprint(message.to),choices:{notifications:false,messageAlerts:true,exchangeMatches:true,polling:false}}}]];
      return original(sql,args);
    });
    permissions.push({scope:'campaign:C123',phone:message.to,purpose:'workforce',status:'opted_in'});
    await expect(prepareSmsDelivery({...message,purpose:'workforce'})).rejects.toMatchObject({code:'sms_staff_choice_off'});
    await expect(prepareSmsDelivery({...message,purpose:'workforce',staffNotificationKind:'messageAlerts'})).resolves.toMatchObject({to:message.to});
    await expect(prepareSmsDelivery({...message,purpose:'workforce',staffNotificationKind:'exchangeMatches'})).resolves.toMatchObject({to:message.to});
    await expect(prepareSmsDelivery({...message,purpose:'polling'})).rejects.toMatchObject({code:'sms_staff_choice_off'});
  });

  it('denies unregistered traffic before invoking the provider', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...sender, registration_json: null }]]);
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_campaign_not_ready' });
  });
  it('rejects a sender from a different practice', async () => {
    await expect(prepareSmsDelivery({ ...message, agencyId: 99 })).rejects.toMatchObject({ code: 'sms_sender_agency_mismatch' });
  });
  it('does not treat an existing phone or channel toggle as permission', async () => {
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_consent_required' });
  });
  it('requires a declared purpose and separate marketing registration', async () => {
    await expect(prepareSmsDelivery({ ...message, purpose: undefined })).rejects.toMatchObject({ code: 'sms_campaign_purpose_mismatch' });
    await expect(prepareSmsDelivery({ ...message, purpose: 'marketing' })).rejects.toMatchObject({ code: 'sms_campaign_purpose_mismatch' });
  });
  it('normalizes phones and brands an authorized reminder', async () => {
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'reminders', status: 'opted_in' });
    expect(await prepareSmsDelivery({ ...message, to: '(303) 555-0101' })).toMatchObject({
      to: message.to, body: 'ITSCO: Your appointment is tomorrow. Reply NOREMIND to stop appointment reminders only. Reply STOP to opt out.'
    });
  });
  it('blocks staff, reminders, and care after STOP from an unknown recipient', async () => {
    const sendReply = vi.fn(async (options) => prepareSmsDelivery(options));
    expect(await processSmsKeyword({ from: message.to, to: message.from, body: 'QUIT', messageId: 'stop1', sendReply })).toBe(true);
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(permissions[0]).toMatchObject({ scope: 'campaign:C123', purpose: 'suppression', status: 'opted_out' });
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'reminders', status: 'opted_in' });
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_opted_out' });
    // The suppression is shared by a second number on the same campaign.
    pool.execute.mockResolvedValueOnce([[{ ...sender, id: 4, phone_number: '+13035550102' }]]);
    await expect(prepareSmsDelivery({ ...message, from: '+13035550102' })).rejects.toMatchObject({ code: 'sms_opted_out' });
  });
  it('does not let a normal inbound text, HELP or YES clear STOP', async () => {
    await processSmsKeyword({ from: message.to, to: message.from, body: 'STOP', sendReply: vi.fn() });
    await recordInboundConversation({ from: message.to, to: message.from, messageId: 'normal' });
    await processSmsKeyword({ from: message.to, to: message.from, body: 'HELP', sendReply: vi.fn() });
    expect(await processSmsKeyword({ from: message.to, to: message.from, body: 'YES', sendReply: vi.fn() })).toBe(false);
    expect(permissions).toHaveLength(1);
    expect(permissions[0].status).toBe('opted_out');
  });
  it('bounds inbound conversation permission and never grants reminders or marketing', async () => {
    await recordInboundConversation({ from: message.to, to: message.from, messageId: 'question' });
    expect(permissions[0]).toMatchObject({ purpose: 'care', status: 'opted_in' });
    expect(permissions[0].expires_at).toBeInstanceOf(Date);
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_consent_required' });
  });
  it('does not grant a new subscription from START', async () => {
    await processSmsKeyword({ from: message.to, to: message.from, body: 'START', sendReply: vi.fn() });
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_consent_required' });
  });
  it('NOREMIND stops reminders only; category-only START restores prior consent and confirms once', async () => {
    permissions.push(...['care','reminders'].map(purpose=>({scope:'campaign:C123',phone:message.to,purpose,status:'opted_in',evidence_json:{source:'web_form',reference:'original-consent'}})));
    const sendReply=vi.fn(async options=>prepareSmsDelivery(options));
    const command={from:message.to,to:message.from,body:' noremind ',messageId:'category-1',sendReply};
    await processSmsKeyword(command);
    await processSmsKeyword(command);
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(sendReply.mock.calls[0][0].body).toContain('provider texting choice is unchanged');
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({code:'sms_consent_required'});
    await expect(prepareSmsDelivery({...message,purpose:'care'})).resolves.toMatchObject({to:message.to});
    await processSmsKeyword({...command,body:'START',messageId:'start-category-1'});
    await expect(prepareSmsDelivery(message)).resolves.toMatchObject({to:message.to});
    expect(permissions.find(p=>p.purpose==='reminders').status).toBe('opted_in');
    expect(sendReply.mock.calls.at(-1)[0].body).toContain('NOREMIND (appointment reminders)');
  });
  it('declining provider texting preserves reminders and an inbound question cannot override that decline', async () => {
    permissions.push({scope:'campaign:C123',phone:message.to,purpose:'care',status:'opted_out'},
      {scope:'campaign:C123',phone:message.to,purpose:'reminders',status:'opted_in'});
    await recordInboundConversation({from:message.to,to:message.from,messageId:'question-after-decline'});
    await expect(prepareSmsDelivery({...message,purpose:'care'})).rejects.toMatchObject({code:'sms_consent_required'});
    await expect(prepareSmsDelivery(message)).resolves.toMatchObject({to:message.to});
  });
  it('Notifyre STOP crosses campaigns, while a delayed START cannot clear a newer STOP', async () => {
    const at=Date.now()-2000;
    await processSmsKeyword({from:message.to,to:message.from,body:'STOP',receivedAt:at,messageId:'dated-stop',sendReply:vi.fn()});
    await processSmsKeyword({from:message.to,to:message.from,body:'START',receivedAt:at-1000,messageId:'old-start',sendReply:vi.fn()});
    expect(phoneState.blocked).toBe(true);
    pool.execute.mockResolvedValueOnce([[{...sender,campaign_id:'OTHER',registration_json:{...registration,campaignId:'OTHER'}}]]);
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({code:'sms_opted_out'});
    pool.execute.mockResolvedValueOnce([[{...sender,campaign_id:'WORK',registration_json:{...registration,provider:'vonage',purposes:['workforce'],campaignId:'WORK'}}]]);
    permissions.push({scope:'campaign:WORK',phone:message.to,purpose:'workforce',status:'opted_in'});
    await expect(prepareSmsDelivery({...message,purpose:'workforce'})).resolves.toMatchObject({to:message.to});
  });
  it('NOREMIND after STOP records the category decline without sending an extra text', async () => {
    const sendReply=vi.fn();
    await processSmsKeyword({from:message.to,to:message.from,body:'STOP',messageId:'stop-before-category',sendReply});
    sendReply.mockClear();
    await processSmsKeyword({from:message.to,to:message.from,body:'NOREMIND',messageId:'category-after-stop',sendReply});
    expect(sendReply).not.toHaveBeenCalled();
    expect(permissions.find(p=>p.purpose==='reminders').status).toBe('opted_out');
  });
  it('gives HELP a real support contact, without changing subscription state', async () => {
    const sendReply = vi.fn();
    await processSmsKeyword({ from: message.to, to: message.from, body: 'INFO', sendReply });
    expect(sendReply.mock.calls[0][0].body).toContain('support@itsco.health');
    expect(permissions).toHaveLength(0);
  });
  it('does not duplicate Vonage Opt-Out Assist replies', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...sender, registration_json: { ...registration, keywordOwner: 'vonage' } }]]);
    const sendReply = vi.fn();
    await processSmsKeyword({ from: message.to, to: message.from, body: 'STOP', sendReply });
    expect(sendReply).not.toHaveBeenCalled();
    expect(permissions[0].status).toBe('opted_out');
  });
  it('rejects an invented control bypass and unsupported attachments', async () => {
    await expect(prepareSmsDelivery({ ...message, complianceReply: {} })).rejects.toMatchObject({ code: 'sms_consent_required' });
    await expect(prepareSmsDelivery({ ...message, mediaUrl: ['https://example.org/file.pdf'] })).rejects.toMatchObject({ code: 'sms_mms_unsupported' });
  });
  it('fails closed when permission storage is unavailable', async () => {
    pool.execute.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(prepareSmsDelivery(message)).rejects.toThrow('Database unavailable');
  });
});

describe('submission and evidence validation', () => {
  it.each(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', ' opt out '])('handles %s before appointment routing', (text) => expect(parseSmsKeyword(text)).toBe('STOP'));
  it.each(['YES', 'Y', 'N', 'R', 'Please cancel my appointment'])('does not interpret %s as subscription consent', (text) => expect(parseSmsKeyword(text)).toBeNull());
  it('rejects missing approval, links, and mixed marketing', () => {
    expect(validateSmsRegistration(registration)).toEqual([]);
    expect(validateSmsRegistration({ ...registration, approved: false, termsUrl: '', purposes: ['care', 'marketing'] })).toHaveLength(3);
  });
  it('requires evidence rather than a manually toggled boolean', () => {
    expect(validateSmsConsentEvidence({ purpose: 'reminders', status: 'opted_in' }).length).toBeGreaterThan(0);
    expect(validateSmsConsentEvidence({ purpose: 'marketing', status: 'opted_in', evidence: {
      source: 'web_form', reference: 'submission:123', signatureReference: 'signed:123', signerVerified: true, disclosure: 'Exact displayed text', collectedAt: '2026-01-01T00:00:00Z', separateMarketingConsent: true
    } })).toEqual([]);
  });
});

it('preserves provider identity and brand without repeating opt-out on authored replies', async () => {
 permissions.push({scope:'campaign:C123',phone:message.to,purpose:'care',status:'opted_in'});
 expect(await prepareSmsDelivery({...message,purpose:'care',body:'Michael: Sounds good.',senderFirstName:'Michael'})).toMatchObject({body:'Sounds good.\n— Michael with ITSCO'});
});
it('a provider name does not bypass consent or STOP', async () => {
 await expect(prepareSmsDelivery({...message,purpose:'care',senderFirstName:'Michael'})).rejects.toMatchObject({code:'sms_consent_required'});
 permissions.push({scope:'campaign:C123',phone:message.to,purpose:'care',status:'opted_in'});
 await processSmsKeyword({from:message.to,to:message.from,body:'STOP',sendReply:vi.fn()});
 await expect(prepareSmsDelivery({...message,purpose:'care',senderFirstName:'Michael'})).rejects.toMatchObject({code:'sms_opted_out'});
});

it('allows one bounded staff request reply without changing recurring consent, but honors STOP and rejects forged/reused replies',async()=>{
 const original=pool.execute.getMockImplementation();const from='+17197163884';
 pool.execute.mockImplementation((sql,args)=>sql.includes('FROM twilio_numbers')?Promise.resolve([[{...sender,phone_number:from,registration_json:{...registration,provider:'vonage',purposes:['workforce','polling']}}]]):original(sql,args));
 const request={from,to:message.to,body:'ITSCO: Open your request securely.',purpose:'workforce'};
 await expect(prepareSmsDelivery({...request,staffAssistantReply:{...request,messageId:'fake'}})).rejects.toMatchObject({code:'sms_consent_required'});
 const capability=staffAssistantReplyCapability({...request,messageId:'inbound-1'});
 await expect(prepareSmsDelivery({...request,staffAssistantReply:capability})).resolves.toMatchObject({to:message.to});
 await expect(prepareSmsDelivery({...request,staffAssistantReply:capability})).rejects.toMatchObject({code:'sms_consent_required'});
 permissions.push({scope:'campaign:C123',phone:message.to,purpose:'suppression',status:'opted_out'});
 await expect(prepareSmsDelivery({...request,staffAssistantReply:staffAssistantReplyCapability({...request,messageId:'inbound-2'})})).rejects.toMatchObject({code:'sms_opted_out'});
 expect(connection.execute).not.toHaveBeenCalled();
});

function relayEnrollmentQueries() {
 const original=connection.execute.getMockImplementation();
 connection.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM provider_sms_relay_enrollments')||sql.startsWith('SELECT e.id FROM provider_sms_relay_enrollments'))return [[{id:1}]];
  if(sql.startsWith('SELECT status FROM sms_recipient_permissions'))return pool.execute(sql,args);
  return original(sql,args);
 });
}
it('NOCLIENTS consumes the command and changes only personal forwarding; repeated delivery does not resend confirmation',async()=>{
 relayEnrollmentQueries();const sendReply=vi.fn();
 const request={from:message.to,to:message.from,body:'NOCLIENTS',messageId:'relay-off',sendReply};
 expect(await processSmsKeyword(request)).toBe(true);await processSmsKeyword(request);
 expect(sendReply).toHaveBeenCalledTimes(1);expect(sendReply.mock.calls[0][0].body).toContain('Your in-app messages and other text choices are unchanged');
 expect(permissions).toContainEqual(expect.objectContaining({scope:'agency:2',purpose:'client_forwarding',status:'opted_out'}));
 expect(permissions.some(p=>p.purpose==='suppression')).toBe(false);
});
it('START lists restored forwarding only for a category restart, while START after STOP preserves the category decline',async()=>{
 relayEnrollmentQueries();const sendReply=vi.fn();
 await processSmsKeyword({from:message.to,to:message.from,body:'NOCLIENTS',messageId:'relay-off-1',sendReply});
 await processSmsKeyword({from:message.to,to:message.from,body:'START',messageId:'relay-start-1',sendReply});
 expect(sendReply.mock.calls.at(-1)[0].body).toContain('NOCLIENTS (client text forwarding)');
 await processSmsKeyword({from:message.to,to:message.from,body:'NOCLIENTS',messageId:'relay-off-2',sendReply});
 phoneState.blocked=true;
 await processSmsKeyword({from:message.to,to:message.from,body:'START',messageId:'relay-start-2',receivedAt:Date.now()+1,sendReply});
 expect(sendReply.mock.calls.at(-1)[0].body).not.toContain('Turned back on:');
 expect(permissions).toContainEqual(expect.objectContaining({purpose:'client_forwarding',status:'opted_out'}));
});
