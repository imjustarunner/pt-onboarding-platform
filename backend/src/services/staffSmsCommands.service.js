import {isClientRelatedTask} from '../constants/taskCategories.js';
import {createHash} from 'node:crypto';
import {workCalendarEvents} from './calendarEvents.service.js';
import {isValidTimeZone,utcDateToZonedYmd,zonedWallTimeToUtc} from '../utils/zonedWallTime.util.js';

const hash = text => createHash('sha256').update(String(text)).digest('hex');
export function staffSmsMenu() {
  return 'Text assistant: #task followed by text adds a personal task (up to 240 characters). #task alone lists your top 5 open tasks. #calendar lists today’s app calendar types and times. MENU shows these instructions anytime. Do not text client details or other sensitive information. Tasks categorized or tagged Client, or linked to client records, are excluded. No emails, coworker messages or calendar changes are made.';
}
export function smsTaskLabel(task) {
  return isClientRelatedTask(task) ? null : String(task.title || 'Untitled task').replace(/\s+/g,' ').slice(0,240);
}
export async function runStaffSmsCommand({request,user,agency,db,requestKey,now=new Date()}, dependencies={calendar:workCalendarEvents}) {
  if (request.kind === 'invalid_task') return {reply:'Task not added. Use #task followed by 1–240 characters. Keep client details and sensitive information in the app.'};
  if (request.kind === 'task_create') {
    const metadata = {source:'momentum_user_request',createdVia:'staff_sms_assistant',smsTitleHash:hash(request.title),requestKey};
    const [result] = await db.execute(`INSERT INTO tasks
      (task_type,title,assigned_to_user_id,assigned_by_user_id,assigned_to_agency_id,status,urgency,is_private,category,categories,metadata)
      VALUES ('custom',?,?,?,?,'pending','medium',1,'general',?,?)`,
      [request.title,user.id,user.id,agency.id,JSON.stringify(['general']),JSON.stringify(metadata)]);
    await db.execute(`INSERT INTO task_audit_log (task_id,action_type,actor_user_id,target_user_id,metadata)
      VALUES (?,'assigned',?,?,?)`,[result.insertId,user.id,user.id,JSON.stringify({source:'staff_sms_assistant',requestKey})]);
    return {reply:`Added to your Tasks (#${result.insertId}). Text #task to see your top five open tasks, or MENU for commands.`,taskId:result.insertId};
  }
  if (request.kind === 'task_list') {
    const tasks = [];
    // Page past excluded clinical tasks so they never displace eligible top-five items.
    for(let offset=0;tasks.length<5;offset+=100) {
      const [batch] = await db.execute(`SELECT id,title,task_type,is_private,category,categories,metadata,reference_id,source_ref_type,source_ref_id,linked_schedule_event_id,description_ciphertext
        FROM tasks WHERE (assigned_to_user_id=? OR (assigned_to_user_id IS NULL AND assigned_by_user_id=? AND task_type='custom' AND task_list_id IS NULL AND project_id IS NULL)) AND status IN ('pending','in_progress')
        AND (assigned_to_agency_id=? OR (assigned_to_agency_id IS NULL AND task_list_id IS NULL AND project_id IS NULL AND assigned_by_user_id=?))
        ORDER BY CASE COALESCE(urgency,'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        (due_date IS NULL),due_date ASC,created_at DESC,id DESC LIMIT 100 OFFSET ${offset}`,[user.id,user.id,agency.id,user.id]);
      for(const task of batch) { if(smsTaskLabel(task)!==null) tasks.push(task); if(tasks.length===5)break; }
      if(batch.length<100)break;
    }
    return {reply:tasks.length ? `Your top ${tasks.length} non-client open tasks (priority, then due date):\n${tasks.map((t,i)=>`${i+1}. ${smsTaskLabel(t)} (#${t.id})`).join('\n')}\nClient tasks excluded. MENU for commands.` : 'No non-client open tasks assigned to you for this agency. Client tasks are excluded. Add one with #task followed by text. MENU for commands.'};
  }
  if (request.kind === 'calendar') {
    const timeZone = isValidTimeZone(agency.timezone) ? agency.timezone : 'America/Denver';
    const day = utcDateToZonedYmd(now,timeZone),[year,month,date] = day.split('-').map(Number);
    const start = zonedWallTimeToUtc({year,month,day:date,hour:0,minute:0,timeZone});
    const next = new Date(Date.UTC(year,month-1,date+1));
    const end = zonedWallTimeToUtc({year:next.getUTCFullYear(),month:next.getUTCMonth()+1,day:next.getUTCDate(),hour:0,minute:0,timeZone});
    const events = await dependencies.calendar(user.id,agency.id,start,end,{summaryOnly:true});
    const times = new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit'});
    const sorted = [...events].sort((a,b)=>new Date(a.start || a.startDate)-new Date(b.start || b.startDate));
    const lines = sorted.map(e=>`${e.startDate ? 'All day' : `${times.format(new Date(e.start))}–${times.format(new Date(e.end))}`} ${e.title}`);
    // Keep long calendars within one reasonable SMS payload; never silently omit events.
    let included=0,body=`Today ${day} (${timeZone}):`;
    for(const line of lines){if(body.length+line.length>1200)break;body+='\n'+line;included++;}
    if(!lines.length)body+=' No app calendar items today.';
    if(included<lines.length)body+=`\n${lines.length-included} more items—open your app calendar for the full day.`;
    return {reply:body+'\nTypes and times only; no client names or meeting contents. MENU for commands.'};
  }
  return {reply:staffSmsMenu()};
}
