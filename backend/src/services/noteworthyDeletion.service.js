import pool from '../config/database.js';
import lifecycle,{noteworthyTrialState} from './noteworthyLifecycle.service.js';
import { encryptBillingSecret,decryptBillingSecret } from './billingEncryption.service.js';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import StorageService from './storage.service.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const identifier=value=>{if(!/^[a-zA-Z0-9_]+$/.test(value))throw fail('DELETION_SCHEMA_REVIEW','Unexpected schema identifier.');return `\`${value}\``;};
const retained=new Set(['agencies','noteworthy_practices','noteworthy_deletion_jobs','migrations_log']);
const legal=name=>name.startsWith('organization_agreement_');
const fileColumn=name=>/(?:storage_(?:uri|path|key)|object_key|(?:attachment|receipt|proof)_file_path|gcs_path|file_path)$/.test(name);

export function noteworthyObjectKey(value,bucket=process.env.PTONBOARDFILES) {
  if(!value || typeof value!=='string')return null;
  let key=value.trim();
  if(key.startsWith('gs://')){const u=new URL(key);if(u.hostname!==bucket)throw fail('DELETION_OBJECT_REVIEW','An object belongs to a different bucket.');key=u.pathname;}
  else if(/^https?:/.test(key)){
    const u=new URL(key);
    if(u.hostname==='storage.googleapis.com'){if(!u.pathname.startsWith(`/${bucket}/`))throw fail('DELETION_OBJECT_REVIEW','An object belongs to a different bucket.');key=u.pathname.slice(bucket.length+2);}
    else if(['plottwisthq.com','fundthred.com'].includes(u.hostname))key=u.pathname.replace(/^\/api\/uploads\//,'uploads/');
    else return null; // External copies cannot be recalled by this workspace.
  }
  try{key=decodeURIComponent(key);}catch{throw fail('DELETION_OBJECT_REVIEW','An object reference is malformed.');}
  key=key.replace(/^\//,'');
  if(!/^(?:uploads|signed|user_documents|user_specific_documents)\//.test(key)||key.split('/').some(p=>p==='..'||p==='.')||/[\u0000-\u001f]/.test(key))throw fail('DELETION_OBJECT_REVIEW','An object reference requires review.');
  return key;
}

/** Build a child-first deletion plan from the real FK graph. Tenant roots
 * always retain their agency predicate; a cross-tenant FK causes a rollback
 * rather than permission to delete another practice's rows. */
export function noteworthyDeletionPlan({tables,references},agencyId,{draftAgreementIds=[],linkedTicketIds=[]}={}) {
  const byName=new Map(tables.map(t=>[t.name,t]));
  const refs=[...references];
  for(const table of tables)for(const column of table.columns){
    let parent=null;
    if(table.name.startsWith('payroll_'))parent=({payroll_period_id:'payroll_periods',payroll_import_id:'payroll_imports',payroll_import_row_id:'payroll_import_rows',payroll_period_run_id:'payroll_period_runs'})[column.name];
    if(table.name.startsWith('support_ticket_')&&column.name==='ticket_id')parent='support_tickets';
    if(table.name.startsWith('communication_')&&column.name==='conversation_id')parent='communication_conversations';
    if(table.name==='communication_attachments'&&column.name==='message_id')parent='communication_messages';
    if(parent&&byName.has(parent)&&!refs.some(r=>r.child===table.name&&r.columns.includes(column.name)))refs.push({child:table.name,parent,columns:[column.name],parentColumns:['id']});
  }
  const scopes=new Map();
  for(const table of tables){
    if(retained.has(table.name))continue;
    const agencyColumns=new Set(table.columns.filter(c=>c.name==='agency_id').map(c=>c.name));
    for(const r of refs)if(r.child===table.name&&r.parent==='agencies'&&r.columns.length===1)agencyColumns.add(r.columns[0]);
    if(legal(table.name)){
      if(!draftAgreementIds.length)continue;
      const column=table.name==='organization_agreement_records'?'id':table.columns.find(c=>['record_id','agreement_id'].includes(c.name))?.name;
      if(column)scopes.set(table.name,{depth:0,render:a=>`${a}.${identifier(column)} IN (${draftAgreementIds.map(()=>'?').join(',')})`,params:draftAgreementIds});
    }else if(agencyColumns.size)scopes.set(table.name,{depth:0,render:a=>`(${[...agencyColumns].map(c=>`${a}.${identifier(c)}=?`).join(' OR ')})`,params:[...agencyColumns].map(()=>agencyId)});
  }
  // Old report-email receipts can have platform-owned mirrors. Only linked
  // tickets of this exact NoteWorthy practice enter the deletion graph.
  if(byName.has('support_tickets')&&linkedTicketIds.length){
    const original=scopes.get('support_tickets');
    scopes.set('support_tickets',{depth:0,params:[...(original?.params || []),...linkedTicketIds],render:a=>`(${original?original.render(a):'0=1'} OR ${a}.id IN (${linkedTicketIds.map(()=>'?').join(',')}))`});
  }
  for(let pass=0;pass<tables.length;pass++){
    let added=false;
    for(const r of refs){
      if(scopes.has(r.child)||retained.has(r.child)||!byName.has(r.child)||!scopes.has(r.parent)||legal(r.child))continue;
      const parent=scopes.get(r.parent),alias=`p${pass}_${scopes.size}`;
      scopes.set(r.child,{depth:parent.depth+1,params:parent.params,render:a=>`EXISTS(SELECT 1 FROM ${identifier(r.parent)} ${alias} WHERE ${r.columns.map((c,i)=>`${a}.${identifier(c)}=${alias}.${identifier(r.parentColumns[i])}`).join(' AND ')} AND (${parent.render(alias)}))`});added=true;
    }
    if(!added)break;
  }
  // Topological order includes direct tenant roots, not just derived depths.
  const order=[],pending=new Set(scopes.keys());
  while(pending.size){const children=[...pending].filter(name=>!refs.some(r=>r.parent===name&&r.child!==name&&pending.has(r.child)));
    if(!children.length)throw fail('DELETION_SCHEMA_REVIEW','A circular record dependency needs operator review.');
    for(const name of children){pending.delete(name);order.push({table:byName.get(name),scope:scopes.get(name)});}}
  return {order,scopes,refs};
}

export async function readNoteworthyDeletionSchema(conn) {
  const [columns]=await conn.execute("SELECT c.TABLE_NAME tableName,c.COLUMN_NAME name,c.IS_NULLABLE nullable FROM INFORMATION_SCHEMA.COLUMNS c JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME WHERE c.TABLE_SCHEMA=DATABASE() AND t.TABLE_TYPE='BASE TABLE'");
  const byName=new Map();for(const c of columns){if(!byName.has(c.tableName))byName.set(c.tableName,{name:c.tableName,columns:[]});byName.get(c.tableName).columns.push({name:c.name,nullable:c.nullable==='YES'});}
  const [keys]=await conn.execute('SELECT TABLE_NAME child,REFERENCED_TABLE_NAME parent,CONSTRAINT_NAME constraintName,COLUMN_NAME childColumn,REFERENCED_COLUMN_NAME parentColumn FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION');
  const grouped=new Map();for(const r of keys){const key=`${r.child}:${r.constraintName}`;if(!grouped.has(key))grouped.set(key,{child:r.child,parent:r.parent,columns:[],parentColumns:[]});grouped.get(key).columns.push(r.childColumn);grouped.get(key).parentColumns.push(r.parentColumn);}
  return {tables:[...byName.values()],references:[...grouped.values()]};
}

export function createNoteworthyDeletion({db=pool,access=lifecycle,now=()=>new Date(),schema=readNoteworthyDeletionSchema,deleteObject=key=>StorageService.deleteObject(key),encrypt=encryptBillingSecret,decrypt=decryptBillingSecret,openAgreement=decryptFamilyBilling}={}) {
  async function draftAgreements(conn,agencyId,catalog){
    if(!catalog.tables.some(t=>t.name==='organization_agreement_records'))return [];
    const [rows]=await conn.execute('SELECT id,kind,source_key,payload FROM organization_agreement_records WHERE agency_id=?',[agencyId]);
    const records=rows.map(r=>({...r,data:openAgreement(r.payload,`organization-agreement:${agencyId}:${r.kind}:${r.id}`)}));
    const keep=new Set(records.filter(r=>['completed','verified_external','partially_signed'].includes(r.data?.status)||r.data?.signatures?.length).map(r=>r.id));
    // Executed PDFs and uploaded originals are separate encrypted records with
    // no status of their own. Preserve their evidence and linked agreements.
    let changed=true;
    while(changed){changed=false;for(const r of records){const links=[r.source_key,r.data?.agreementId,r.data?.uploadId].filter(Boolean);
      if(keep.has(r.id)||links.some(id=>keep.has(id)))for(const id of [r.id,...links])if(!keep.has(id)){keep.add(id);changed=true;}}}
    return records.filter(r=>!keep.has(r.id)).map(r=>r.id);
  }
  async function runOne(agencyId) {
    const conn=await db.getConnection();let locked=false;
    try{
      const [[lock]]=await conn.execute('SELECT GET_LOCK(?,0) acquired',[`noteworthy-delete:${agencyId}`]);if(!lock.acquired)return {busy:true};locked=true;
      await conn.beginTransaction();
      const [[row]]=await conn.execute('SELECT * FROM noteworthy_practices WHERE agency_id=? FOR UPDATE',[agencyId]);
      const [[job]]=await conn.execute('SELECT * FROM noteworthy_deletion_jobs WHERE agency_id=? FOR UPDATE',[agencyId]);
      if(!row||!job||job.status==='completed'){await conn.rollback();return {skipped:true};}
      await access.assertStandalone(agencyId,conn);
      const state=noteworthyTrialState(row,now());
      if(!row.deletion_requested_at && state.state!=='deletion_due'){await conn.rollback();return {skipped:true};}
      // Freeze writes before discovering/removing any record or object.
      await conn.execute('UPDATE noteworthy_practices SET deletion_requested_at=COALESCE(deletion_requested_at,UTC_TIMESTAMP()) WHERE agency_id=?',[agencyId]);
      await conn.execute("UPDATE noteworthy_deletion_jobs SET status='processing',attempts=attempts+1,error_code=NULL WHERE agency_id=?",[agencyId]);
      const catalog=await schema(conn);
      const [linkedTickets]=await conn.execute('SELECT support_ticket_id FROM noteworthy_contact_threads WHERE agency_id=?',[agencyId]);
      const plan=noteworthyDeletionPlan(catalog,agencyId,{draftAgreementIds:await draftAgreements(conn,agencyId,catalog),linkedTicketIds:linkedTickets.map(t=>t.support_ticket_id)});
      const keys=new Set();
      if(job.object_manifest_enc){const manifest=JSON.parse(decrypt(JSON.parse(job.object_manifest_enc)));if(manifest.agencyId!==agencyId)throw fail('DELETION_MANIFEST_REVIEW','The deletion manifest does not match.');for(const key of manifest.keys)keys.add(key);}
      for(const {table,scope} of plan.order){const columns=table.columns.filter(c=>fileColumn(c.name));if(!columns.length)continue;
        const [files]=await conn.execute(`SELECT ${columns.map(c=>`t.${identifier(c.name)}`).join(',')} FROM ${identifier(table.name)} t WHERE ${scope.render('t')}`,scope.params);
        for(const file of files)for(const column of columns){const key=noteworthyObjectKey(file[column.name]);if(key)keys.add(key);}}
      // A path copied into another active record is not permission to remove
      // that other record's object. Shared references require operator review.
      for(const table of catalog.tables){const scope=plan.scopes.get(table.name);for(const column of table.columns.filter(c=>fileColumn(c.name))){
        if(!keys.size)break;
        const values=[...keys].flatMap(key=>[key,`/${key}`,`gs://${process.env.PTONBOARDFILES}/${key}`,`https://storage.googleapis.com/${process.env.PTONBOARDFILES}/${key}`]);
        const [[shared]]=await conn.execute(`SELECT 1 present FROM ${identifier(table.name)} t WHERE t.${identifier(column.name)} IN (${values.map(()=>'?').join(',')})${scope?` AND NOT (${scope.render('t')})`:''} LIMIT 1`,[...values,...(scope?.params || [])]);
        if(shared)throw fail('DELETION_SHARED_OBJECT_REVIEW','A stored object has a reference outside this workspace.');
      }}
      await conn.execute('UPDATE noteworthy_deletion_jobs SET object_manifest_enc=? WHERE agency_id=?',[JSON.stringify(encrypt(JSON.stringify({agencyId,keys:[...keys]}))),agencyId]);
      await conn.commit();
      // Delete stored objects first. Partial failures leave the encrypted
      // manifest and all DB records available to the retry worker.
      for(const key of keys)await deleteObject(key);
      await conn.beginTransaction();
      await conn.execute('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? FOR UPDATE',[agencyId]);
      await access.assertStandalone(agencyId,conn);
      const [roster]=await conn.execute('SELECT payroll_user_id FROM noteworthy_roster WHERE agency_id=?',[agencyId]);
      let deletedRows=0;
      for(const {table,scope} of plan.order){
        // Nullable self-references are cleared only inside the deletion scope.
        const self=plan.refs.filter(r=>r.child===table.name&&r.parent===table.name);
        for(const r of self)if(r.columns.every(c=>table.columns.find(v=>v.name===c)?.nullable))await conn.execute(`UPDATE ${identifier(table.name)} t SET ${r.columns.map(c=>`${identifier(c)}=NULL`).join(',')} WHERE ${scope.render('t')}`,scope.params);
        const [result]=await conn.execute(`DELETE t FROM ${identifier(table.name)} t WHERE ${scope.render('t')}`,scope.params);deletedRows+=Number(result.affectedRows || 0);
      }
      for(const employee of roster)await conn.execute(`UPDATE users SET first_name='Deleted',last_name='NoteWorthy roster record',is_active=0,is_archived=1
        WHERE id=? AND is_roster_placeholder=1 AND email IS NULL AND NOT EXISTS(SELECT 1 FROM user_agencies WHERE user_id=users.id)`,[employee.payroll_user_id]);
      await conn.execute("DELETE FROM noteworthy_signups WHERE verified_agency_id=?",[agencyId]);
      await conn.execute("UPDATE agencies SET name='Deleted NoteWorthy workspace',is_active=0 WHERE id=?",[agencyId]);
      await conn.execute('UPDATE noteworthy_practices SET deleted_at=UTC_TIMESTAMP(),activation_enc=NULL,activation_request_enc=NULL,commercial_evidence_enc=NULL WHERE agency_id=?',[agencyId]);
      await conn.execute("UPDATE noteworthy_deletion_jobs SET status='completed',object_manifest_enc=NULL,error_code=NULL,deleted_row_count=?,deleted_object_count=?,completed_at=UTC_TIMESTAMP() WHERE agency_id=?",[deletedRows,keys.size,agencyId]);
      await conn.commit();return {completed:true,deletedRows,deletedObjects:keys.size};
    }catch(error){try{await conn.rollback();}catch{}
      const code=/^[A-Z_0-9]+$/.test(error.code || '')?error.code:'DELETION_RETRY_REQUIRED';
      try{await db.execute("UPDATE noteworthy_deletion_jobs SET status=?,error_code=? WHERE agency_id=?",[['EHR_DATA_REVIEW_REQUIRED','DELETION_SCHEMA_REVIEW','DELETION_OBJECT_REVIEW','DELETION_SHARED_OBJECT_REVIEW','DELETION_MANIFEST_REVIEW'].includes(code)?'review_required':'retry',code,agencyId]);}catch{}
      return {completed:false,errorCode:code};
    }finally{if(locked)try{await conn.execute('SELECT RELEASE_LOCK(?)',[`noteworthy-delete:${agencyId}`]);}catch{}conn.release();}
  }
  async function tick() {
    const [due]=await db.execute(`SELECT n.agency_id FROM noteworthy_practices n WHERE n.trial_policy_version=1 AND n.trial_policy_accepted_at IS NOT NULL
      AND n.deleted_at IS NULL AND n.commercial_activated_at IS NULL AND n.trial_ends_at IS NOT NULL
      AND DATE_ADD(n.trial_ends_at,INTERVAL n.retention_days DAY)<=UTC_TIMESTAMP() LIMIT 20`);
    for(const row of due)await access.queue(row.agency_id,'trial_expired');
    const [jobs]=await db.execute("SELECT agency_id FROM noteworthy_deletion_jobs WHERE status IN ('queued','retry','processing') AND (status<>'retry' OR updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)) LIMIT 10");
    const results=[];for(const job of jobs)results.push(await runOne(job.agency_id));return results;
  }
  return {runOne,tick};
}
export default createNoteworthyDeletion();
