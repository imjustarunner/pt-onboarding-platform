import pool from '../config/database.js';
import Task from '../models/Task.model.js';
import {prepareEncryptedTicketText} from '../utils/supportTicketCrypto.js';
import {assignTechnologyTicket} from '../services/technologySupport.service.js';

export function taskReportContext(task) {
  const keys=['id','title','task_type','status','created_at','updated_at','assigned_to_user_id','assigned_to_role','assigned_to_agency_id','assigned_by_user_id','source_ref_type','source_ref_id','reference_id','task_list_id','project_id'];
  // Do not copy arbitrary metadata or decrypted clinical descriptions into a ticket.
  return Object.fromEntries(keys.map(key=>[key,task[key]??null]));
}
export async function reportTask(req,res,next) {
  let db,locked=false;const id=Number(req.params.id),uid=Number(req.user.id);
  const lock=`task-report:${id}:${uid}`;
  try {
    const question=String(req.body.question||'').trim();
    if(!Number.isSafeInteger(id)||id<1||question.length<5||question.length>8000)throw Object.assign(new Error('Select a task and describe what seems wrong.'),{status:400});
    // Reuse the Tasks visibility policy; an id or administrator label alone does
    // not authorize reporting another tenant's/private task.
    const visible=await Task.findByUser(uid,{includeHiring:true});
    const task=visible.find(t=>Number(t.id)===id);
    if(!task)throw Object.assign(new Error('This task is not available to your account.'),{status:404});
    const aid=Number(task.assigned_to_agency_id||req.body.agencyId);
    const [[member]]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1 LIMIT 1',[uid,aid||0]);
    if(!member)throw Object.assign(new Error('Choose an agency you belong to for this report.'),{status:403});
    const text=`Reported problem:\n${question}\n\nTask details at report time:\n${JSON.stringify(taskReportContext(task),null,2)}\n\nTechnology: review the task audit history and source rule to establish why it was created and why it remains open.`;
    const enc=prepareEncryptedTicketText(text);
    if(!enc.encrypted)throw Object.assign(new Error('Secure ticket storage is unavailable. Please try again later.'),{status:503});
    db=await pool.getConnection();
    const [[l]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);
    if(Number(l?.acquired)!==1)throw Object.assign(new Error('A report for this task is already being submitted.'),{status:409});
    locked=true;await db.beginTransaction();
    const source=`task_report:${id}:${uid}`;
    const [[existing]]=await db.execute("SELECT id FROM support_tickets WHERE agency_id=? AND created_by_user_id=? AND created_by_source_key=? AND status IN ('open','in_progress') ORDER BY id DESC LIMIT 1",[aid,uid,source]);
    if(existing){await db.rollback();return res.json({ticketId:existing.id,existing:true});}
    const [created]=await db.execute(`INSERT INTO support_tickets
      (agency_id,school_organization_id,created_by_user_id,created_by_source_key,subject,question,question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,status,topic,priority)
      VALUES (?,?,?,?,?,?,?,?,?,?,'open','technology','medium')`,[aid,aid,uid,source,`Task #${id} — reported issue`,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
    await assignTechnologyTicket({ticketId:created.insertId,agencyId:aid},db);
    await db.commit();res.status(201).json({ticketId:created.insertId});
  }catch(e){if(db)await db.rollback();next(e);}
  finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{});db?.release();}
}
