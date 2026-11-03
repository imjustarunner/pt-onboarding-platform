import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
import pool from '../../config/database.js';
import { providerRelayOptedOut, setProviderRelayPreference, restartProviderRelay } from '../providerRelayPreference.service.js';
const sender={id:6,agency_id:450,scope:'campaign:C'},phone='+12025550101';
let prefs,events,enrolled,eligible,connection;
beforeEach(()=>{
 vi.clearAllMocks();prefs=new Map();events=new Set();enrolled=true;eligible=true;
 pool.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT status FROM'))return[prefs.has(args.join('|'))?[{status:prefs.get(args.join('|'))}]:[]];
  if(sql.startsWith('SELECT id FROM provider_sms_relay_enrollments'))return[enrolled?[{id:1}]:[]];
  if(sql.startsWith('SELECT e.id'))return[eligible?[{id:1}]:[]];
  if(sql.startsWith('INSERT IGNORE INTO sms_permission_events')){const key=[...args.slice(0,3),args[5]].join('|');if(args[5]&&events.has(key))return[{affectedRows:0}];events.add(key);return[{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO sms_recipient_permissions'))prefs.set(args.slice(0,3).join('|'),args[3]);
  return[{affectedRows:1}];
 });
 connection={execute:pool.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(connection);
});
it('NOCLIENTS is scoped to the agency/phone and never disables app access, other categories or the saved enrollment',async()=>{
 await setProviderRelayPreference({sender,phone,enabled:false,evidence:{source:'inbound_noclients',messageId:'m1'}});
 expect(await providerRelayOptedOut({agencyId:450,phone})).toBe(true);
 expect(await providerRelayOptedOut({agencyId:451,phone})).toBe(false);
 expect(await providerRelayOptedOut({agencyId:450,phone:'+12025550102'})).toBe(false);
 expect(pool.execute.mock.calls.some(([sql])=>/UPDATE (user_preferences|provider_sms_relay_enrollments)/.test(sql))).toBe(false);
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes("r.status='cancelled'"))).toBe(true);
});
it('duplicate NOCLIENTS cannot undo a later intentional restart',async()=>{
 const request={sender,phone,enabled:false,evidence:{source:'inbound_noclients',messageId:'m1'}};
 expect(await setProviderRelayPreference(request)).toBe(true);
 expect(await restartProviderRelay({sender,phone,evidence:{source:'inbound_start',messageId:'m2'}})).toBe(true);
 expect(await setProviderRelayPreference(request)).toBe(false);expect(await providerRelayOptedOut({agencyId:450,phone})).toBe(false);
});
it('never subscribes a new provider or revives an explicitly disabled enrollment',async()=>{
 enrolled=false;expect(await setProviderRelayPreference({sender,phone,enabled:false,evidence:{source:'inbound_noclients'}})).toBe(false);
 enrolled=true;await setProviderRelayPreference({sender,phone,enabled:false,evidence:{source:'inbound_noclients'}});
 eligible=false;expect(await restartProviderRelay({sender,phone,evidence:{source:'inbound_start'}})).toBe(false);
 expect(await providerRelayOptedOut({agencyId:450,phone})).toBe(true);
});
