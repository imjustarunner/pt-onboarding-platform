import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../smsCompliance.service.js',()=>({getSmsSender:vi.fn(),isSmsSuppressed:vi.fn(),prepareSmsDelivery:vi.fn(),resolveRegisteredSmsSender:vi.fn()}));
vi.mock('../companyEventAudience.service.js',()=>({isCompanyEventInvitee:vi.fn()}));
import pool from '../../config/database.js';
import { getSmsSender,isSmsSuppressed } from '../smsCompliance.service.js';
import { isCompanyEventInvitee } from '../companyEventAudience.service.js';
import { parseCompanyEventSmsCommand } from '../../utils/companyEventSms.js';
import { handleCompanyEventTopicInbound } from '../companyEventSms.service.js';

const sender={agency_id:2,phone_number:'+13035550100',campaign_id:'C2'};
const delivery={id:20,user_id:5,agency_id:2,company_event_id:7,code:112,title:'Anniversary',is_active:1,starts_at:null,ends_at:null,operations_json:{},dispatch_type:'rsvp_invitation',purpose:'workforce'};
const input={from:'+13035550101',to:sender.phone_number,body:'Maybe 112'};
beforeEach(()=>{vi.resetAllMocks();getSmsSender.mockResolvedValue(sender);isSmsSuppressed.mockResolvedValue(false);isCompanyEventInvitee.mockResolvedValue(true);});
const setup=(row=delivery)=>pool.execute.mockImplementation(async(sql)=>{
  if(sql.startsWith('SELECT d.*'))return [[row]];
  if(sql.startsWith('SELECT 1 FROM company_event_sms_preferences'))return [[]];
  if(sql.startsWith('SELECT u.id'))return [[{id:5}]];
  return [{affectedRows:1}];
});

describe('event invitation SMS RSVP',()=>{
  it.each([['Yes','Y'],['No','N'],['Maybe','M'],['112 MAYBE','M'],['Maybe 112','M'],['YES112','Y'],['112NO','N'],['MAYBE112','M']])('recognizes %s without using configurable poll options',(text,response)=>{
    expect(parseCompanyEventSmsCommand(text)).toMatchObject({type:'interest',response});
  });
  it('records Maybe in the invitation and does not assign payroll work',async()=>{
    setup();const result=await handleCompanyEventTopicInbound(input);
    expect(result).toMatchObject({handled:true,eventId:7,purpose:'workforce'});expect(result.responseMessage).toContain('is maybe');
    const update=pool.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE company_event_invitations'));
    expect(update[1]).toEqual(['maybe',7,5]);
    expect(pool.execute.mock.calls.some(([sql])=>/INSERT.*assignments|INSERT.*punches/.test(sql))).toBe(false);
  });
  it('a bare invitation code explains how to RSVP without muting or changing the response',async()=>{
    setup();const result=await handleCompanyEventTopicInbound({...input,body:'112'});
    expect(result.responseMessage).toContain('Yes 112, No 112, or Maybe 112');
    expect(result.responseMessage).toContain('have not changed');
    expect(pool.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
  });
  it('explicit MUTE still turns off only this event and never changes an RSVP',async()=>{
    setup();const result=await handleCompanyEventTopicInbound({...input,body:'MUTE 112'});
    expect(result).toMatchObject({handled:true,muted:true,eventId:7});
    expect(pool.execute.mock.calls.filter(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql)).map(([sql])=>sql)).toEqual([expect.stringContaining('INSERT INTO company_event_sms_preferences')]);
  });
  it.each(['Yes 112','Maybe 112'])('includes the agency event link and potluck next step after %s',async body=>{
    setup({...delivery,potluck_enabled:1,staff_link_token:'a'.repeat(48)});
    const original=pool.execute.getMockImplementation();
    pool.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT id,name,slug')?[[{id:2,slug:'itsco'}]]:original(sql,args));
    const result=await handleCompanyEventTopicInbound({...input,body});
    expect(result.responseMessage).toContain('sign in on the event page to choose or update');
    expect(result.responseMessage).toContain('https://app.itsco.health/company-events/7/staff/');
    expect(result.responseMessage).toContain('No 112');
  });
  it('still confirms a saved potluck RSVP when the branding lookup is temporarily unavailable',async()=>{
    setup({...delivery,potluck_enabled:1});const original=pool.execute.getMockImplementation();
    pool.execute.mockImplementation(async(sql,args)=>{if(sql.startsWith('SELECT id,name,slug'))throw Error('temporary lookup failure');return original(sql,args);});
    const result=await handleCompanyEventTopicInbound({...input,body:'Yes 112'});
    expect(result.responseMessage).toContain('is yes');expect(result.responseMessage).toContain('Potluck: sign in');
  });
  it('keeps RSVP open when a linked legacy vote has closed',async()=>{
    setup({...delivery,voting_closed_at:'2020-01-01T00:00:00Z'});
    expect((await handleCompanyEventTopicInbound(input)).responseMessage).toContain('is maybe');
  });
  it('honors RSVP deadlines',async()=>{
    setup({...delivery,rsvp_deadline:'2020-01-01T00:00:00Z'});
    expect((await handleCompanyEventTopicInbound(input)).responseMessage).toContain('closed');
    expect(isCompanyEventInvitee).not.toHaveBeenCalled();
  });
  it('does not accept a reply from an invitee removed from the audience',async()=>{
    setup();isCompanyEventInvitee.mockResolvedValue(false);await handleCompanyEventTopicInbound(input);
    expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE company_event_invitations'))).toBe(false);
  });
  it('does not attribute a shared phone to the latest invited person',async()=>{
    pool.execute.mockResolvedValueOnce([[delivery,{...delivery,id:21,user_id:6}]]).mockResolvedValueOnce([[]]);
    expect((await handleCompanyEventTopicInbound(input)).responseMessage).toContain('shared');
    expect(isCompanyEventInvitee).not.toHaveBeenCalled();
  });
  it('requires the phone to still belong to the selected invitee',async()=>{
    pool.execute.mockResolvedValueOnce([[delivery]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
    await handleCompanyEventTopicInbound(input);expect(pool.execute.mock.calls).toHaveLength(3);
  });
  it('retains STOP and event-specific mute',async()=>{
    setup();isSmsSuppressed.mockResolvedValue(true);await handleCompanyEventTopicInbound(input);
    expect(isCompanyEventInvitee).not.toHaveBeenCalled();
    expect(pool.execute.mock.calls).toHaveLength(1);
  });
  it('asks which event when a plain Yes could match an invitation and a poll',async()=>{
    pool.execute.mockResolvedValueOnce([[delivery,{...delivery,id:21,company_event_id:8,code:113,dispatch_type:'vote_invite'}]]);
    const result=await handleCompanyEventTopicInbound({...input,body:'Yes'});
    expect(result.responseMessage).toContain('112, 113');expect(pool.execute).toHaveBeenCalledTimes(1);
  });
});
