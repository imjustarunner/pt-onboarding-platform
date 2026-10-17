import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../insuranceCards/service.js',()=>({cardContext:vi.fn(),refreshCardFollowup:vi.fn()}));
vi.mock('../guardianAppointments.service.js',()=>({guardianReminderPreferences:vi.fn()}));
vi.mock('../familyLedger/senders.js',()=>({requireReadySender:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
import {runInsuranceCardReminders} from '../insuranceCards/reminders.js';
let deps,connection,progress,enabled,uncertain,claimed;
beforeEach(()=>{
 enabled=1;uncertain=false;claimed=new Set();progress={state:'missing',email_enabled:1,cycle_hash:'synthetic',first_requested_at:new Date('2026-10-01')};
 connection={beginTransaction:vi.fn(),commit:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.includes('SELECT enabled'))return [[{enabled}]];
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('SELECT id FROM insurance_card_deliveries'))return [uncertain?[{id:1}]:[]];
  if(sql.includes('INSERT IGNORE INTO insurance_card_deliveries')){const key=args.join(':');if(claimed.has(key))return [{affectedRows:0}];claimed.add(key);return [{affectedRows:1,insertId:7}];}
  return [{affectedRows:1}];
 })};
 deps={db:{execute:vi.fn(async sql=>sql.includes('SELECT f.profile_id')?[[{profile_id:5,agency_id:1,enabled}]]:[{}]),getConnection:vi.fn().mockResolvedValue(connection)},now:new Date('2026-10-01T12:00:00Z'),
 context:vi.fn().mockResolvedValue({profile:{id:5,guardian_user_id:10,email:'synthetic@example.invalid',user_status:'ACTIVE',slug:'synthetic'},clients:[{id:1},{id:2}]}),refresh:vi.fn().mockImplementation(async()=>({...progress})),preferences:vi.fn().mockResolvedValue({channels:{email:true},optionalRemindersEnabled:true}),sender:vi.fn().mockResolvedValue({id:1,from_email:'billing@example.invalid'}),send:vi.fn().mockResolvedValue({id:'synthetic',communicationId:7})};
});
it('sends one generic message for a sibling policy and deduplicates a repeated worker',async()=>{await runInsuranceCardReminders(deps);await runInsuranceCardReminders(deps);expect(deps.send).toHaveBeenCalledOnce();const mail=deps.send.mock.calls[0][0];expect(mail.text).toContain('panel=payment_methods');expect(mail.text).not.toContain('member');expect(mail.text).not.toContain('client');expect(mail.usedFallbackSender).toBe(false);expect(connection.release).toHaveBeenCalledTimes(2);});
it.each(['review','complete','help','waived','not_required'])('does not email for %s',async state=>{progress.state=state;await runInsuranceCardReminders(deps);expect(deps.send).not.toHaveBeenCalled();});
it('respects per-practice enablement and personal opt-out',async()=>{enabled=0;await runInsuranceCardReminders(deps);enabled=1;progress.email_enabled=0;await runInsuranceCardReminders(deps);progress.email_enabled=1;deps.preferences.mockResolvedValue({channels:{email:false}});await runInsuranceCardReminders(deps);expect(deps.send).not.toHaveBeenCalled();});
it('stops when authority is revoked or a missing image arrives before dispatch',async()=>{deps.context.mockRejectedValueOnce(Object.assign(new Error('Unavailable'),{status:404}));await runInsuranceCardReminders(deps);deps.refresh.mockResolvedValueOnce({...progress}).mockResolvedValueOnce({...progress,state:'review'});await runInsuranceCardReminders(deps);expect(deps.send).not.toHaveBeenCalled();});
it('holds uncertain outcomes across future reminder dates',async()=>{deps.send.mockRejectedValue(new Error('timeout'));await runInsuranceCardReminders(deps);expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining("status='unknown'"),[7]);uncertain=true;deps.now=new Date('2026-10-20');await runInsuranceCardReminders(deps);expect(deps.send).toHaveBeenCalledOnce();});
it('never uses a fallback sender or competes with another worker',async()=>{deps.sender.mockRejectedValue(new Error('unconfigured'));await runInsuranceCardReminders(deps);connection.execute.mockResolvedValue([[{acquired:0}]]);await runInsuranceCardReminders(deps);expect(deps.send).not.toHaveBeenCalled();});
