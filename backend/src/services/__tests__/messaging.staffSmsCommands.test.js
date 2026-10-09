import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../calendarEvents.service.js',()=>({workCalendarEvents:vi.fn()}));
import {runStaffSmsCommand,smsTaskLabel,staffSmsMenu} from '../staffSmsCommands.service.js';
import {parseStaffSmsRequest} from '../../utils/staffSmsAssistant.js';
import {isClientRelatedTask,normalizeTaskCategories} from '../../constants/taskCategories.js';
const user={id:7},agency={id:2,timezone:'America/Denver'};
it('recognizes explicit commands without guessing calendar changes or consuming votes',()=>{
 expect(parseStaffSmsRequest('#TaSk Update the Kudos page and incorporate a menu')).toEqual({kind:'task_create',title:'Update the Kudos page and incorporate a menu'});
 expect(parseStaffSmsRequest('#task')).toEqual({kind:'task_list'});expect(parseStaffSmsRequest('#calendar')).toEqual({kind:'calendar'});
 expect(parseStaffSmsRequest('#task '+ 'x'.repeat(241)).kind).toBe('invalid_task');expect(parseStaffSmsRequest('#calendar delete tomorrow').kind).toBe('menu');
 for(const x of ['1','Mon','HELP','STOP','Y'])expect(parseStaffSmsRequest(x)).toBeNull();
 expect(staffSmsMenu()).toContain('MENU');expect(normalizeTaskCategories(['client','general'])).toContain('client');
});
it('creates a private personal task assigned to the sender in the existing Tasks table, without an email or coworker assignment',async()=>{
 const db={execute:vi.fn(async()=>[{insertId:42}])};
 const result=await runStaffSmsCommand({request:{kind:'task_create',title:'Update Kudos'},user,agency,db,requestKey:'dedup'});
 expect(result.taskId).toBe(42);expect(db.execute.mock.calls[0][0]).toContain('INSERT INTO tasks');
 expect(db.execute.mock.calls[0][1].slice(0,4)).toEqual(['Update Kudos',7,7,2]);expect(db.execute.mock.calls[1][0]).toContain('task_audit_log');
});
it('excludes Client categories, Client tags, encrypted and linked tasks, including legacy records',()=>{
 for(const extra of [{category:'client'},{categories:'["client","general"]'},{metadata:{tags:['Client']}},{metadata:{clientId:44}},{metadata:{client:{id:44}}},{source_ref_type:'school_intake_review'},{linked_schedule_event_id:4},{description_ciphertext:'secret'}]) {
  const task={title:'SECRET CLIENT TITLE',...extra};expect(isClientRelatedTask(task)).toBe(true);expect(smsTaskLabel(task)).toBeNull();
 }
 expect(smsTaskLabel({title:'Update the Kudos page',category:'general'})).toBe('Update the Kudos page');
 expect(smsTaskLabel({title:'Sign workplace handbook',task_type:'document',reference_id:2})).toBe('Sign workplace handbook');
});
it('lists the first five eligible tasks with stable priority/due sorting and strict agency/owner scope',async()=>{
 const blocked=Array.from({length:100},(_,id)=>({id,title:'SECRET',category:'client'}));
 const db={execute:vi.fn().mockResolvedValueOnce([blocked]).mockResolvedValueOnce([Array.from({length:7},(_,id)=>({id:101+id,title:'General task '+id,category:'general'}))])};
 const {reply}=await runStaffSmsCommand({request:{kind:'task_list'},user,agency,db});
 expect(reply).not.toContain('SECRET');expect(reply).toContain('General task 4');expect(reply).not.toContain('General task 5');
 expect(db.execute.mock.calls[0][1]).toEqual([7,7,2,7]);expect(db.execute.mock.calls[0][0]).toContain("status IN ('pending','in_progress')");expect(db.execute.mock.calls[1][0]).toContain('OFFSET 100');
});
it('uses today in the agency timezone, handles DST, and requests only calendar summaries',async()=>{
 const calendar=vi.fn(async()=>[{title:'Supervision',start:'2026-11-01T16:00:00Z',end:'2026-11-01T17:00:00Z'}]);
 const {reply}=await runStaffSmsCommand({request:{kind:'calendar'},user,agency,now:new Date('2026-11-01T20:00Z')},{calendar});
 const args=calendar.mock.calls[0];expect(args.slice(0,2)).toEqual([7,2]);expect(+args[3]-args[2]).toBe(25*3600000);expect(args[4]).toEqual({summaryOnly:true});
 expect(reply).toContain('9:00 AM–10:00 AM Supervision');expect(reply).toContain('2026-11-01 (America/Denver)');
});
it('clearly reports empty and truncated calendar days',async()=>{
 const run=calendar=>runStaffSmsCommand({request:{kind:'calendar'},user,agency,now:new Date('2026-10-09T20:00Z')},{calendar});
 expect((await run(async()=>[])).reply).toContain('No app calendar items');
 const events=Array.from({length:100},()=>({title:'Team meeting',start:'2026-10-09T16:00Z',end:'2026-10-09T17:00Z'}));
 const {reply}=await run(async()=>events);expect(reply).toContain('more items');expect(reply.length).toBeLessThan(1500);
});
