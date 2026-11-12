import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import { createSecureSessionComments, sessionCommentAttention } from '../secureSessionComments.service.js';
import { encryptChatText, decryptChatText } from '../chatEncryption.service.js';
afterEach(()=>vi.unstubAllEnvs());
it('enforces 250 Unicode code points before persistence and fails closed without encryption',async()=>{
  const db={getConnection:vi.fn(async()=>{throw new Error('VALIDATED_INPUT');})};
  const service=createSecureSessionComments({db});
  await expect(service.create({body:'🙂'.repeat(251)})).rejects.toMatchObject({status:400});
  await expect(service.edit({body:'🙂'.repeat(251)})).rejects.toMatchObject({status:400});
  expect(db.getConnection).not.toHaveBeenCalled();
  await expect(service.create({body:'🙂'.repeat(250),requestId:'request_unique_001',recipientUserIds:[2]})).rejects.toThrow('VALIDATED_INPUT');
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');expect(()=>encryptChatText('Synthetic only')).toThrow();
});
it('decrypts earlier encrypted revisions through a rotation key ring and rejects authenticated tampering',()=>{
  const old=Buffer.alloc(32,19).toString('base64'),next=Buffer.alloc(32,29).toString('base64');
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',old);vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_ID','qa-old');const encrypted=encryptChatText('Fictional encrypted revision');
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',next);vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEYS_JSON',JSON.stringify({'qa-old':old}));
  expect(decryptChatText(encrypted)).toBe('Fictional encrypted revision');expect(()=>decryptChatText({...encrypted,authTagB64:Buffer.alloc(16).toString('base64')})).toThrow();
});
describe('local-day attention and end of last day session',()=>{
  const appointments=[{id:1,clientId:10,startAt:'2026-11-11T16:00:00Z',endAt:'2026-11-11T17:00:00Z',status:'scheduled'},
    {id:2,clientId:11,startAt:'2026-11-11T22:00:00Z',endAt:'2026-11-11T23:00:00Z',status:'scheduled'}];
  const comments=[{id:8,readAt:null,isOwn:false,appointment:appointments[0]}];
  const calculate=(extra={})=>sessionCommentAttention({appointments,comments,now:new Date('2026-11-11T20:00:00Z'),timeZone:'America/Denver',...extra});
  it('keeps morning unread while later appointment with no comments remains, stops after last completion/passage',()=>{
    expect(calculate()).toMatchObject({showSplash:true,lastSessionEndAt:'2026-11-11T23:00:00.000Z'});
    expect(calculate({now:new Date('2026-11-11T23:00:00Z')})).toMatchObject({showSplash:false,dayFinished:true});
    expect(calculate({appointments:appointments.map(a=>a.id===2?{...a,status:'completed'}:a)}).showSplash).toBe(false);
    expect(calculate({appointments:appointments.map(a=>a.id===2?{...a,status:'canceled_by_client'}:a)}).showSplash).toBe(false);
  });
  it('dismisses only the current seen watermark/day; a newer comment reappears, snooze expires',()=>{
    const state={day_key:'2026-11-11',time_zone:'America/Denver',action:'dismiss_today',watermark:8};
    expect(calculate({state}).showSplash).toBe(false);expect(calculate({state,comments:[...comments,{...comments[0],id:9}]}).showSplash).toBe(true);
    expect(calculate({state:{...state,day_key:'2026-11-10'}}).showSplash).toBe(true);
    expect(calculate({state:{...state,action:'snooze',snoozed_until:'2026-11-11 20:30:00'}}).showSplash).toBe(false);
    expect(calculate({state:{...state,action:'snooze',snoozed_until:'2026-11-11 19:30:00'}}).showSplash).toBe(true);
  });
  it('uses local calendar boundaries through both DST transitions and never marks next day or own comments unread',()=>{
    const a={id:1,clientId:10,startAt:'2026-11-01T07:30:00Z',endAt:'2026-11-01T10:00:00Z',status:'scheduled'};
    const result=calculate({appointments:[a],comments:[{id:1,appointment:a}],now:new Date('2026-11-01T08:30:00Z')});expect(result.dayKey).toBe('2026-11-01');expect(result.showSplash).toBe(true);
    const spring={...a,startAt:'2026-03-08T08:30:00Z',endAt:'2026-03-08T11:00:00Z'};
    expect(calculate({appointments:[spring],comments:[{id:2,appointment:spring}],now:new Date('2026-03-08T09:30:00Z')}).showSplash).toBe(true);
    expect(calculate({timeZone:'Asia/Kolkata'}).showSplash).toBe(false);expect(calculate({comments:[{...comments[0],isOwn:true}]}).showSplash).toBe(false);
  });
  it('keeps a same-instant late-night fixture on today while an appointment an hour later belongs to tomorrow',()=>{
    const now=new Date('2026-11-12T06:59:59Z'); // 23:59:59 in Denver, Nov 11.
    const sameInstant={id:1,clientId:10,startAt:now.toISOString(),endAt:new Date(now.getTime()+3600000).toISOString(),status:'scheduled'};
    const result=calculate({now,appointments:[sameInstant],comments:[{id:1,appointment:sameInstant}]});
    expect(result).toMatchObject({dayKey:'2026-11-11',showSplash:true});expect(result.unread).toHaveLength(1);
    const nextDay={...sameInstant,startAt:new Date(now.getTime()+3600000).toISOString()};
    expect(calculate({now,appointments:[nextDay],comments:[{id:1,appointment:nextDay}]}).unread).toEqual([]);
  });
});
