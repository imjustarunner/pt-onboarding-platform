import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/AgencyContact.model.js',()=>({default:{findByEmail:vi.fn()}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantNoreplyMailbox:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import AgencyContact from '../../models/AgencyContact.model.js';
import {ensureTenantNoreplyMailbox} from '../tenantMessageMailboxes.service.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {filterUnsolicitedOutreach as filter,filterSharedMailboxOutreach,isEstablishedOutreachSender,sendQueuedOutreachRejections as deliver} from '../unsolicitedOutreach.service.js';

const pitch={agencyId:2,fromEmail:'Sales@Vendor.test',subject:'SEO Report',bodyText:'We provide SEO services. Interested in a free audit and pricing?'};
let blocks,notices,db,relationships;
beforeEach(()=>{
  vi.clearAllMocks();
  blocks=new Map();notices=new Map();relationships='';
  AgencyContact.findByEmail.mockResolvedValue(null);
  Agency.findById.mockResolvedValue({id:2,name:'ITSCO'});
  ensureTenantNoreplyMailbox.mockResolvedValue({noreply:{id:50,agency_id:2,is_active:1,from_email:'noreply@agency.test'}});
  sendEmailFromIdentity.mockResolvedValue({id:'gmail-1',communicationId:8});
  const execute=vi.fn(async(raw,args=[])=>{
    const sql=raw.replace(/\s+/g,' ').trim();
    const key=(aid,email)=>`${aid}:${email}`;
    if(sql.startsWith('SELECT')&&sql.includes('FROM communication_blocked_addresses')){
      return [[blocks.get(key(args[0],args[1]))].filter(Boolean)];
    }
    if(sql.startsWith('INSERT IGNORE INTO communication_blocked_addresses')){
      const k=key(args[0],args[1]);if(!blocks.has(k))blocks.set(k,{id:1,reason:args[2]});return [{affectedRows:1}];
    }
    if(sql.startsWith('INSERT INTO unsolicited_outreach_notices')){
      const k=key(args[0],args[1]);
      if(notices.has(k))notices.get(k).suppression_count++;
      else notices.set(k,{id:notices.size+1,agency_id:args[0],sender_email:args[1],status:args[4],suppression_count:1});
      return [{affectedRows:1}];
    }
    if(sql.startsWith('SELECT * FROM unsolicited_outreach_notices'))return [[...notices.values()].filter(row=>row.status==='queued'&&!row.delayed).map(row=>({...row}))];
    if(sql.startsWith('UPDATE unsolicited_outreach_notices')){
      if(sql.includes('suppression_count=suppression_count+1')){const row=notices.get(key(args[0],args[1]));if(row)row.suppression_count++;return [{affectedRows:row?1:0}];}
      if(sql.includes("WHERE status='sending'"))return [{affectedRows:0}];
      const row=[...notices.values()].find(row=>row.id===args.at(-1));
      if(sql.includes("status='sending'")){
        if(!row||row.status!=='queued')return [{affectedRows:0}];row.status='sending';return [{affectedRows:1}];
      }
      if(sql.includes("status='queued'")){row.status='queued';row.delayed=true;}
      else if(sql.includes("status='needs_review'"))row.status='needs_review';
      else if(sql.includes("status='skipped'"))row.status='skipped';
      else if(sql.includes('status=?'))row.status=args[0];
      return [{affectedRows:1}];
    }
    if(sql.startsWith('SELECT')&&['FROM users','FROM clients','FROM client_guardians','FROM school_contacts'].some(table=>sql.includes(table)))return [relationships&&sql.includes(relationships)?[{id:9}]:[]];
    throw new Error(`Unexpected fixture query: ${sql}`);
  });
  pool.execute.mockImplementation(execute);
  db={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  pool.getConnection.mockResolvedValue(db);
});

describe('suppress commercial outreach before staff delivery',()=>{
  it('blocks normalized exact address in its agency and queues a single response',async()=>{
    expect(await filter(pitch)).toMatchObject({filtered:true,noticeQueued:true,reason:'seo'});
    expect(blocks.has('2:sales@vendor.test')).toBe(true);
    expect(db.commit).toHaveBeenCalledOnce();expect(db.release).toHaveBeenCalledOnce();
    expect(sendEmailFromIdentity).not.toHaveBeenCalled();
    await filter(pitch);await filter({...pitch,bodyText:'A different message'});
    expect(notices.size).toBe(1);expect([...notices.values()][0].suppression_count).toBe(3);
    await filter({...pitch,agencyId:6});expect(notices.size).toBe(2);
    expect(blocks.has('6:sales@vendor.test')).toBe(true);
  });
  it.each(['FROM users','FROM clients','FROM client_guardians','FROM school_contacts','agency_contact'])('preserves established %s relationships',async relation=>{
    if(relation==='agency_contact')AgencyContact.findByEmail.mockResolvedValue({id:8});else relationships=relation;
    expect(await filter(pitch)).toEqual({filtered:false});expect(blocks.size).toBe(0);expect(notices.size).toBe(0);
  });
  it('normalizes addresses even when checking existing tickets directly',async()=>{
    relationships='FROM users';
    expect(await isEstablishedOutreachSender(2,' Known@Example.test ')).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('FROM users'),['known@example.test','known@example.test','known@example.test']);
  });
  it('leaves possible care requests available when relationship checks fail',async()=>{
    AgencyContact.findByEmail.mockRejectedValue(Object.assign(new Error('DB unavailable'),{code:'LOOKUP_UNAVAILABLE'}));
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    expect(await filter(pitch)).toEqual({filtered:false});expect(blocks.size).toBe(0);
  });
  it('respects manual address blocks without sending another email',async()=>{
    blocks.set('2:sales@vendor.test',{id:1,reason:'manual spam block'});
    expect(await filter(pitch)).toMatchObject({filtered:true,noticeQueued:false});expect(notices.size).toBe(0);
  });
  it('still accepts an explicit care request or genuine applicant after an automatic commercial block',async()=>{
    await filter(pitch);
    expect(await filter({...pitch,bodyText:'I need therapy for my child.'})).toEqual({filtered:false});
    expect(await filter({...pitch,bodyText:'I’m applying for a job. My resume is ready.'})).toEqual({filtered:false});
    expect(notices.size).toBe(1);
  });
  it.each([['auto-submitted','auto-generated'],['precedence','bulk'],['x-auto-response-suppress','All']])('does not auto-reply to loop-prone mail (%s)',async(name,value)=>{
    expect(await filter({...pitch,headers:new Map([[name,value]])})).toMatchObject({filtered:true,noticeQueued:false});
    expect([...notices.values()][0].status).toBe('skipped');expect(blocks.size).toBe(1);
  });
  it('suppresses phone-only pitches without inventing a recipient or email block',async()=>{
    expect(await filter({...pitch,fromEmail:''})).toMatchObject({filtered:true,noticeQueued:false});
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('rolls back address registration if durable notice insertion fails',async()=>{
    db.execute=vi.fn().mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{reason:'auto_unsolicited:seo'}]]).mockRejectedValueOnce(new Error('insertion failed'));
    await expect(filter(pitch)).rejects.toThrow('insertion failed');
    expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
  });
  it('filters shared departmental and general inboxes, leaving personal and internal mail alone',async()=>{
    const identity={id:1,agency_id:2,is_active:1,identity_key:'support',kind:'shared'};
    expect(await filterSharedMailboxOutreach({...pitch,identity,ourFromEmails:['sales@vendor.test']})).toEqual({filtered:false});
    expect(await filterSharedMailboxOutreach({...pitch,identity:{...identity,kind:'personal'}})).toEqual({filtered:false});
    expect(await filterSharedMailboxOutreach({...pitch,identity})).toMatchObject({filtered:true});
    expect([...notices.values()][0].status).toBe('queued');
  });
});

describe('once per sender rejection delivery',()=>{
  it('uses tenant no-reply for both From identity and Reply-To, with no staff ticket',async()=>{
    await filter(pitch);expect(await deliver()).toEqual([{id:1,status:'sent'}]);
    expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:50,to:'sales@vendor.test',replyToOverride:'noreply@agency.test',source:'auto',templateType:'unsolicited_outreach_rejection',text:expect.stringContaining('Remove ITSCO'),internetMessageIdOverride:expect.stringMatching(/^<outreach-[a-f0-9]{32}@agency\.test>$/)}));
    await deliver();expect(sendEmailFromIdentity).toHaveBeenCalledOnce();
    expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO support_tickets'))).toBe(false);
  });
  it('claims a notice atomically across two workers',async()=>{
    await filter(pitch);await Promise.all([deliver(),deliver()]);expect(sendEmailFromIdentity).toHaveBeenCalledOnce();
  });
  it.each(['unblocked','established'])('does not email a sender that became %s',async state=>{
    await filter(pitch);if(state==='unblocked')blocks.clear();else relationships='FROM users';
    expect(await deliver()).toEqual([{id:1,status:'skipped'}]);expect(sendEmailFromIdentity).not.toHaveBeenCalled();
  });
  it.each([
    {id:50,agency_id:2,is_active:0,from_email:'noreply@agency.test'},
    {id:50,agency_id:6,is_active:1,from_email:'noreply@other.test'},
    {id:50,agency_id:2,is_active:1,from_email:'po@agency.test'}
  ])('never falls back to a personal or wrong-tenant sender',async noreply=>{
    await filter(pitch);ensureTenantNoreplyMailbox.mockResolvedValue({noreply});
    expect(await deliver()).toEqual([{id:1,status:'needs_review'}]);expect(sendEmailFromIdentity).not.toHaveBeenCalled();
  });
  it('holds uncertain transport failures for review instead of emailing twice',async()=>{
    await filter(pitch);sendEmailFromIdentity.mockRejectedValue(new Error('unknown transport outcome'));
    expect(await deliver()).toEqual([{id:1,status:'needs_review'}]);await deliver();expect(sendEmailFromIdentity).toHaveBeenCalledOnce();
  });
  it('leaves existing approval gates intact without re-enqueueing the email',async()=>{
    await filter(pitch);sendEmailFromIdentity.mockResolvedValue({id:123,communicationId:8,pendingApproval:true});
    expect(await deliver()).toEqual([{id:1,status:'needs_review'}]);await deliver();expect(sendEmailFromIdentity).toHaveBeenCalledOnce();
  });
  it('waits when organization email is temporarily disabled',async()=>{
    await filter(pitch);sendEmailFromIdentity.mockResolvedValue({skipped:true,reason:'global_email_disabled'});
    expect(await deliver()).toEqual([{id:1,status:'queued'}]);await deliver();expect(sendEmailFromIdentity).toHaveBeenCalledOnce();
  });
});
