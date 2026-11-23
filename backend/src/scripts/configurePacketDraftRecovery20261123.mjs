import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import esbuild from '../../../frontend/node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';

// Explicit owner approval in this conversation, 2026-11-23. This is operational
// provisioning only. The procedure-only principal performs all client changes.
const project='ptonboard-dev',region='us-west3',database='onboarding_stage';
const account='packet-recovery-20261123',serviceAccount=`${account}@${project}.iam.gserviceaccount.com`;
const databaseUser='packet_recovery_20261123',procedure='ops_packet_recovery_20261123',manifest='ops_packet_recovery_manifest_20261123';
const secret='packet-recovery-20261123-db-password';
const approved=[{id:131,org:257,doc:2668},{id:133,org:280,doc:2680},{id:141,org:151,doc:2695},{id:250,org:151,doc:4650},{id:251,org:430,doc:4651},{id:252,org:5,doc:4670},{id:254,org:12,doc:4672}];
const hash=crypto.createHash('sha256').update(JSON.stringify({approval:'owner-seven-packet-automation-20261123',agencyId:2,approved})).digest('hex');
const image='us-west3-docker.pkg.dev/ptonboard-dev/private-packet-scanner/worker@sha256:669b7ba77bb3832cb784c601a0c64e7592240331f4308bac7795b58882707989';
const evidence=new URL('../../../artifacts/packet-draft-recovery-20261123/',import.meta.url);
const env=dotenv.parse(fs.readFileSync('/Users/mendez/PTOnboardingApp/backend/.env'));
const cloud=(args,input)=>{try{return execFileSync('/Users/mendez/google-cloud-sdk/bin/gcloud',[...args,`--project=${project}`,'--quiet'],{input,encoding:'utf8',maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']});}catch(error){error.cloudAction=args.slice(0,3).join(' ');error.safeDetail=String(error.stderr||'').slice(0,1600);throw error;}};
const exists=args=>{try{cloud(args);return true;}catch{return false;}};
const progress=step=>console.log(JSON.stringify({step,automation:account}));
const sql=`CREATE PROCEDURE \`${procedure}\`(IN p_hash CHAR(64),IN p_draft INT,IN p_operation VARCHAR(12),IN p_data JSON)
SQL SECURITY DEFINER
BEGIN
 DECLARE v_org INT; DECLARE v_doc INT; DECLARE v_client INT; DECLARE v_task INT; DECLARE v_code INT;
 DECLARE v_status VARCHAR(32); DECLARE v_state VARCHAR(32); DECLARE v_student VARCHAR(200); DECLARE v_initials VARCHAR(20);
 DECLARE v_identity VARCHAR(32) DEFAULT 'needs_review'; DECLARE v_date DATE; DECLARE v_summary JSON;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF SUBSTRING_INDEX(USER(),'@',1)<>'${databaseUser}' OR p_hash<>'${hash}' OR p_draft NOT IN (131,133,141,250,251,252,254) OR p_operation NOT IN ('inspect','import') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outside the seven-packet automation authorization';
 END IF;
 START TRANSACTION;
 SELECT organization_id,document_id,client_id,task_id,recovery_state INTO v_org,v_doc,v_client,v_task,v_state FROM \`${manifest}\` WHERE draft_id=p_draft AND manifest_hash=p_hash FOR UPDATE;
 IF v_doc IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Packet not in the approved manifest'; END IF;
 IF NOT EXISTS(SELECT 1 FROM referral_packet_upload_drafts d JOIN client_phi_documents p ON p.id=d.phi_document_id
   WHERE d.id=p_draft AND d.agency_id=2 AND d.organization_id=v_org AND p.id=v_doc AND p.agency_id=2 AND p.school_organization_id=v_org AND p.removed_at IS NULL
   AND ((v_client IS NULL AND d.created_client_id IS NULL AND d.status='draft' AND p.client_id IS NULL AND p.referral_draft_id=p_draft)
      OR (v_client IS NOT NULL AND d.created_client_id=v_client AND d.status='submitted' AND p.client_id=v_client))) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='The approved packet source or client linkage changed';
 END IF;
 IF p_operation='inspect' THEN
  INSERT INTO phi_document_audit_logs(document_id,client_id,action,actor_user_id,actor_label,metadata)
  VALUES(v_doc,v_client,'automation_packet_recovery_read',NULL,'${account}',JSON_OBJECT('actor_type','automation','database_session_user',USER(),'cloud_service_account','${serviceAccount}','manifest_hash',p_hash,'draft_id',p_draft));
  COMMIT;
  SELECT p.id,p.storage_path,p.original_name,p.mime_type,p.school_organization_id,p.is_encrypted,p.encryption_key_id,p.encryption_wrapped_key,p.encryption_iv,p.encryption_auth_tag,p.encryption_alg,
    v_state recovery_state,v_client recovery_client_id FROM client_phi_documents p WHERE p.id=v_doc;
 ELSE
  IF v_state='scanned' THEN COMMIT; SELECT v_client client_id,v_task task_id,'already_scanned' identity_status,(SELECT initials FROM clients WHERE id=v_client) initials;
  ELSE
   SET v_student=NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.studentName'))),'null');
   SET v_initials=NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.studentInitials'))),'null');
   IF v_student IS NOT NULL AND (LENGTH(v_student)>200 OR v_initials IS NULL OR v_initials NOT REGEXP '^[A-Za-z]{2,6}$') THEN SET v_student=NULL;SET v_initials=NULL; END IF;
   IF v_student IS NOT NULL AND EXISTS(SELECT 1 FROM users u JOIN referral_packet_upload_drafts d ON d.uploaded_by_user_id=u.id
       WHERE d.id IN (131,133,141,250,251,252,254) AND LOWER(REGEXP_REPLACE(v_student,'[^[:alnum:]]',''))=LOWER(REGEXP_REPLACE(CONCAT(u.first_name,u.last_name),'[^[:alnum:]]',''))) THEN
     SET v_student=NULL;SET v_initials=NULL;SET v_identity='uploader_name_rejected';
   ELSEIF v_student IS NOT NULL THEN SET v_identity='packet_read_needs_review'; END IF;
   SET v_initials=COALESCE(v_initials,'TBD');
   SET v_summary=JSON_EXTRACT(p_data,'$.summary');
   IF v_summary IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.sha256')) NOT REGEXP '^[0-9a-f]{64}$' OR JSON_EXTRACT(p_data,'$.ocr.ciphertext') IS NULL THEN
     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A completed private file check and encrypted OCR evidence are required';
   END IF;
   SELECT submission_date INTO v_date FROM referral_packet_upload_drafts WHERE id=p_draft FOR UPDATE;
   IF v_client IS NULL THEN
    INSERT INTO client_identifier_sequences(sequence_key,last_number) VALUES('client',99999) ON DUPLICATE KEY UPDATE sequence_key=VALUES(sequence_key);
    SELECT last_number INTO v_code FROM client_identifier_sequences WHERE sequence_key='client' FOR UPDATE;
    SET v_code=v_code+1;
    WHILE EXISTS(SELECT 1 FROM clients WHERE identifier_code=CAST(v_code AS CHAR)) DO SET v_code=v_code+1; END WHILE;
    IF v_code>999999 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Client identifier sequence is exhausted'; END IF;
    UPDATE client_identifier_sequences SET last_number=v_code WHERE sequence_key='client';
    INSERT INTO clients(organization_id,agency_id,provider_id,initials,full_name,status,submission_date,document_status,source,created_by_user_id,identifier_code,client_type,client_status_id,paperwork_status_id,onboarding_docs_json)
    VALUES(v_org,2,NULL,v_initials,v_student,'PACKET',v_date,'PACKET','SCHOOL_UPLOAD_INTERNAL',NULL,CAST(v_code AS CHAR),'school',317,
      (SELECT id FROM paperwork_statuses WHERE agency_id=2 AND status_key='all_needed' LIMIT 1),
      JSON_OBJECT('paperPacketSource',JSON_OBJECT('documentId',v_doc,'draftId',p_draft),'packetRecovery',JSON_OBJECT('actor_type','automation','identity','${account}','draftId',p_draft,'humanReviewRequired',TRUE,'identityStatus',v_identity)));
    SET v_client=LAST_INSERT_ID();
    INSERT INTO client_agency_assignments(client_id,agency_id,is_primary,is_active) VALUES(v_client,2,TRUE,TRUE);
    INSERT INTO client_organization_assignments(client_id,organization_id,is_primary,is_active) VALUES(v_client,v_org,TRUE,TRUE);
    INSERT INTO client_status_history(client_id,changed_by_user_id,field_changed,from_value,to_value,note)
      VALUES(v_client,NULL,'created',NULL,JSON_OBJECT('status','PACKET','source','SCHOOL_UPLOAD_INTERNAL','automation_identity','${account}','referral_draft_id',p_draft),CONCAT('Owner-approved automated recovery of saved packet #',p_draft,'. Uploader remains recorded on the original draft; student identity comes from packet OCR and requires review.'));
    UPDATE client_phi_documents SET client_id=v_client,referral_draft_id=NULL WHERE id=v_doc AND client_id IS NULL;
    UPDATE referral_packet_upload_drafts SET status='submitted',created_client_id=v_client,submitted_at=NOW(),last_error=NULL WHERE id=p_draft AND status='draft' AND created_client_id IS NULL;
   END IF;
   UPDATE client_phi_documents SET scan_status='clean',scan_result='Private ClamAV check completed by approved packet-recovery-20261123 automation',scanned_at=NOW() WHERE id=v_doc AND client_id=v_client;
   INSERT INTO client_referral_ocr_requests(client_id,referral_draft_id,phi_document_id,requested_by_user_id,status,expires_at,result_text_encrypted,is_encrypted,encryption_key_id,encryption_wrapped_key,encryption_iv,encryption_auth_tag,encryption_alg,encryption_aad)
   VALUES(v_client,p_draft,v_doc,NULL,'completed',DATE_ADD(NOW(),INTERVAL 7 DAY),FROM_BASE64(JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.ciphertext'))),TRUE,
    JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.key')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.wrapped')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.iv')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.tag')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.alg')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.aad')));
   INSERT INTO client_paper_packet_vision_evals(client_id,school_organization_id,phi_document_id,storage_path,detected_version_label,confidence,roi_signature_detected,disclosure_signature_detected,deny_staff_user_ids_json,review_reasons_json,raw_vision_summary_json,status)
   SELECT v_client,v_org,v_doc,storage_path,NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.detectedVersion')),'null'),0,
    JSON_EXTRACT(p_data,'$.roiSignature')=CAST('true' AS JSON),JSON_EXTRACT(p_data,'$.disclosureSignature')=CAST('true' AS JSON),JSON_ARRAY(),JSON_ARRAY('recovered_packet_identity_and_duplicates_need_human_review'),v_summary,'needs_review' FROM client_phi_documents WHERE id=v_doc;
   INSERT INTO tasks(task_type,title,description,assigned_to_agency_id,assigned_to_role,assigned_by_user_id,source_ref_type,source_ref_id,categories,metadata)
   VALUES('custom',CONCAT('Review recovered paper packet · ',v_initials,' · #',v_client),
    'Owner-approved packet recovery: verify the student identity against the original packet, review possible duplicates, and complete enrollment. Uploader is provenance, not the student. No consent or active treatment status has been granted.',
    2,'support',NULL,'paper_packet_processing',CAST(p_draft AS CHAR),JSON_ARRAY('client'),JSON_OBJECT('referralDraftId',p_draft,'schoolOrganizationId',v_org,'documentId',v_doc,'clientId',v_client,'clientInitials',v_initials,'actor_type','automation','automation_identity','${account}','humanReviewRequired',TRUE));
   SET v_task=LAST_INSERT_ID();
   INSERT INTO phi_document_audit_logs(document_id,client_id,action,actor_user_id,actor_label,metadata)
   VALUES(v_doc,v_client,'automation_packet_recovered',NULL,'${account}',JSON_OBJECT('actor_type','automation','database_session_user',USER(),'cloud_service_account','${serviceAccount}','manifest_hash',p_hash,'draft_id',p_draft,'student_identity_source','packet_ocr','identity_status',v_identity,'source_sha256',JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.sha256')),'task_id',v_task,'human_review_required',TRUE));
   UPDATE \`${manifest}\` SET client_id=v_client,task_id=v_task,recovery_state='scanned',identity_status=v_identity,completed_at=NOW() WHERE draft_id=p_draft;
   COMMIT;
   SELECT v_client client_id,v_task task_id,v_initials initials,v_identity identity_status;
  END IF;
 END IF;
END`;

// A separate append-only evidence pass may fill only unidentified records that
// this same approved recovery created. It cannot overwrite an identified child.
const identityProcedure='ops_packet_identity_recovery_20261123';
const identitySql=`CREATE PROCEDURE \`${identityProcedure}\`(IN p_hash CHAR(64),IN p_draft INT,IN p_operation VARCHAR(12),IN p_data JSON)
SQL SECURITY DEFINER
BEGIN
 DECLARE v_client INT;DECLARE v_doc INT;DECLARE v_org INT;DECLARE v_task INT;DECLARE v_initials VARCHAR(20);DECLARE v_name VARCHAR(200);DECLARE v_identity VARCHAR(32) DEFAULT 'needs_review';
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 IF SUBSTRING_INDEX(USER(),'@',1)<>'${databaseUser}' OR p_hash<>'${hash}' OR p_draft NOT IN (131,133,141,250,251,252,254) OR p_operation NOT IN ('status','apply') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outside the seven-packet identity authorization';END IF;
 START TRANSACTION;
 SELECT m.client_id,m.document_id,m.organization_id,m.task_id,c.initials INTO v_client,v_doc,v_org,v_task,v_initials
 FROM \`${manifest}\` m JOIN clients c ON c.id=m.client_id AND c.agency_id=2 AND c.organization_id=m.organization_id
 JOIN client_phi_documents p ON p.id=m.document_id AND p.client_id=c.id AND p.agency_id=2 AND p.school_organization_id=m.organization_id AND p.removed_at IS NULL AND p.scan_status='clean'
 WHERE m.draft_id=p_draft AND m.manifest_hash=p_hash AND m.recovery_state='scanned' FOR UPDATE;
 IF v_client IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No scanned client in this recovery';END IF;
 IF p_operation='apply' AND v_initials='TBD' THEN
  SET v_name=NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.studentName'))),'null');
  SET v_initials=NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.studentInitials'))),'null');
  IF v_name IS NOT NULL AND (LENGTH(v_name)>200 OR v_initials IS NULL OR v_initials NOT REGEXP '^[A-Za-z]{2,6}$') THEN SET v_name=NULL;SET v_initials=NULL;END IF;
  IF v_name IS NOT NULL AND EXISTS(SELECT 1 FROM users u JOIN referral_packet_upload_drafts d ON d.uploaded_by_user_id=u.id
   WHERE d.id IN (131,133,141,250,251,252,254) AND LOWER(REGEXP_REPLACE(v_name,'[^[:alnum:]]',''))=LOWER(REGEXP_REPLACE(CONCAT(u.first_name,u.last_name),'[^[:alnum:]]',''))) THEN SET v_name=NULL;SET v_initials=NULL;SET v_identity='uploader_name_rejected';END IF;
  IF v_name IS NOT NULL THEN
   SET v_identity='packet_read_needs_review';
   UPDATE clients SET full_name=v_name,initials=v_initials,updated_by_user_id=NULL,updated_at=NOW() WHERE id=v_client AND initials='TBD' AND COALESCE(full_name,'')='';
   UPDATE tasks SET title=CONCAT('Review recovered paper packet · ',v_initials,' · #',v_client),metadata=JSON_SET(metadata,'$.clientInitials',v_initials),updated_at=NOW() WHERE id=v_task AND assigned_to_agency_id=2 AND source_ref_type='paper_packet_processing';
  END IF;
  INSERT INTO client_referral_ocr_requests(client_id,referral_draft_id,phi_document_id,requested_by_user_id,status,expires_at,result_text_encrypted,is_encrypted,encryption_key_id,encryption_wrapped_key,encryption_iv,encryption_auth_tag,encryption_alg,encryption_aad)
   VALUES(v_client,p_draft,v_doc,NULL,'completed',DATE_ADD(NOW(),INTERVAL 7 DAY),FROM_BASE64(JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.ciphertext'))),TRUE,
    JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.key')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.wrapped')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.iv')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.tag')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.alg')),JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.ocr.aad')));
  INSERT INTO client_paper_packet_vision_evals(client_id,school_organization_id,phi_document_id,storage_path,confidence,review_reasons_json,raw_vision_summary_json,status)
   SELECT v_client,v_org,v_doc,storage_path,0,JSON_ARRAY('raster_read_identity_requires_human_review'),JSON_EXTRACT(p_data,'$.summary'),'needs_review' FROM client_phi_documents WHERE id=v_doc;
  INSERT INTO phi_document_audit_logs(document_id,client_id,action,actor_user_id,actor_label,metadata)
   VALUES(v_doc,v_client,'automation_packet_identity_reread',NULL,'${account}',JSON_OBJECT('actor_type','automation','database_session_user',USER(),'cloud_service_account','${serviceAccount}','manifest_hash',p_hash,'draft_id',p_draft,'identity_status',v_identity,'source_sha256',JSON_UNQUOTE(JSON_EXTRACT(p_data,'$.sha256'))));
  UPDATE \`${manifest}\` SET identity_status=v_identity WHERE draft_id=p_draft;
 END IF;
 COMMIT;
 SELECT v_client client_id,v_task task_id,(SELECT initials FROM clients WHERE id=v_client) initials,(SELECT identity_status FROM \`${manifest}\` WHERE draft_id=p_draft) identity_status;
END`;

let db,password;
try {
 fs.mkdirSync(evidence,{recursive:true});
 db=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3307),user:env.DB_USER,password:env.DB_PASSWORD,database,charset:'utf8mb4_unicode_ci',connectTimeout:10000});
 await db.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
 const [rows]=await db.query('SELECT d.id,d.organization_id,d.agency_id,d.phi_document_id,d.status,d.created_client_id,p.storage_path,p.encryption_key_id FROM referral_packet_upload_drafts d JOIN client_phi_documents p ON p.id=d.phi_document_id WHERE d.id IN (131,133,141,250,251,252,254)');
 for(const expected of approved){const row=rows.find(r=>r.id===expected.id);if(!row||row.organization_id!==expected.org||row.phi_document_id!==expected.doc||row.agency_id!==2)throw Error('APPROVED_SCOPE_CHANGED');}
 const summary={approvedDrafts:approved,manifestHash:hash,automationIdentity:serviceAccount,databaseUser,procedure,scope:'Seven immutable draft/document/school pairs in agency 2; pending intake records, private malware scan and student OCR only. No human application actor, activation, consent, invitations, or duplicate merges.'};
 fs.writeFileSync(new URL('approved-plan.json',evidence),JSON.stringify(summary,null,2)+'\n');
 if(!process.argv.includes('--configure')){console.log(JSON.stringify({...summary,applied:false}));}
 else {
  progress('cloud_identity');
  if(!exists(['iam','service-accounts','describe',serviceAccount]))cloud(['iam','service-accounts','create',account,'--display-name=Approved seven-packet recovery automation','--description=Owner-approved recovery of seven immutable packet sources; no application user identity']);
  cloud(['projects','add-iam-policy-binding',project,`--member=serviceAccount:${serviceAccount}`,'--role=roles/cloudsql.client',`--condition=expression=resource.name == 'projects/${project}/instances/ptonboard-mysql' && resource.service == 'sqladmin.googleapis.com',title=seven-packet-recovery-sql`,'--format=value(version)']);
  cloud(['projects','add-iam-policy-binding',project,`--member=serviceAccount:${serviceAccount}`,'--role=roles/serviceusage.serviceUsageConsumer','--condition=None','--format=value(version)']);
  const prefixes=rows.map(r=>String(r.storage_path).match(/^(.*?\/[0-9]+-[a-z0-9]+-)/i)?.[1]);if(prefixes.some(p=>!p))throw Error('EXACT_STORAGE_SCOPE_UNAVAILABLE');
  const storageCondition=prefixes.map(p=>`resource.name.startsWith('projects/_/buckets/${env.PTONBOARDFILES}/objects/${p}')`).join(' || ');
  cloud(['storage','buckets','add-iam-policy-binding',`gs://${env.PTONBOARDFILES}`,`--member=serviceAccount:${serviceAccount}`,'--role=roles/storage.objectViewer',`--condition=expression=${storageCondition},title=seven-approved-packet-objects`,'--format=value(version)']);
  for(const key of new Set(rows.map(r=>r.encryption_key_id))){const m=key.match(/^projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+)$/);if(!m)throw Error('KEY_REFERENCE_INVALID');cloud(['kms','keys','add-iam-policy-binding',m[4],`--location=${m[2]}`,`--keyring=${m[3]}`,`--member=serviceAccount:${serviceAccount}`,'--role=roles/cloudkms.cryptoKeyEncrypterDecrypter','--format=value(version)']);}
  progress('scoped_database_identity');
  if(exists(['secrets','describe',secret]))password=cloud(['secrets','versions','access','latest',`--secret=${secret}`]).trim();
  else{password='Pp7!'+crypto.randomBytes(32).toString('hex');cloud(['secrets','create',secret,'--replication-policy=automatic','--data-file=-'],password);}
  cloud(['secrets','add-iam-policy-binding',secret,`--member=serviceAccount:${serviceAccount}`,'--role=roles/secretmanager.secretAccessor','--format=value(version)']);
  const [[user]]=await db.execute("SELECT COUNT(*) n FROM mysql.user WHERE User=? AND Host='%'",[databaseUser]);
  if(!Number(user.n))await db.query("CREATE USER ?@'%' IDENTIFIED BY ?",[databaseUser,password]);
  const [grants]=await db.query("SHOW GRANTS FOR ?@'%'",[databaseUser]);if(grants.some(r=>Object.values(r).some(v=>!v.startsWith('GRANT USAGE ')&&![procedure,identityProcedure].some(p=>v.startsWith(`GRANT EXECUTE ON PROCEDURE \`${database}\`.\`${p}\``)))))throw Error('AUTOMATION_IDENTITY_HAS_UNEXPECTED_GRANTS');
  await db.query(`CREATE TABLE IF NOT EXISTS \`${manifest}\`(draft_id INT PRIMARY KEY,document_id INT NOT NULL,organization_id INT NOT NULL,manifest_hash CHAR(64) NOT NULL,client_id INT NULL,task_id INT NULL,recovery_state VARCHAR(32) NOT NULL DEFAULT 'pending',identity_status VARCHAR(32) NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,completed_at DATETIME NULL)`);
  for(const row of approved){await db.execute(`INSERT IGNORE INTO \`${manifest}\`(draft_id,document_id,organization_id,manifest_hash) VALUES(?,?,?,?)`,[row.id,row.doc,row.org,hash]);}
  const [[routine]]=await db.execute('SELECT COUNT(*) n FROM information_schema.routines WHERE routine_schema=? AND routine_name=?',[database,procedure]);
  if(!Number(routine.n))await db.query(sql);
  await db.query(`GRANT EXECUTE ON PROCEDURE \`${database}\`.\`${procedure}\` TO ?@'%'`,[databaseUser]);
  const [[identityRoutine]]=await db.execute('SELECT COUNT(*) n FROM information_schema.routines WHERE routine_schema=? AND routine_name=?',[database,identityProcedure]);
  if(!Number(identityRoutine.n))await db.query(identitySql);
  await db.query(`GRANT EXECUTE ON PROCEDURE \`${database}\`.\`${identityProcedure}\` TO ?@'%'`,[databaseUser]);
  await db.end();db=null;
  const scoped=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3307),user:databaseUser,password,database,connectTimeout:10000});
  let deniedSelect=false,deniedScope=false;try{await scoped.query('SELECT id FROM clients LIMIT 1');}catch{deniedSelect=true;}
  try{await scoped.execute(`CALL ${procedure}(?,?,?,?)`,[hash,236,'inspect','{}']);}catch{deniedScope=true;}
  await scoped.end();if(!deniedSelect||!deniedScope)throw Error('AUTOMATION_BOUNDARY_CHECK_FAILED');
  progress('cloud_job');
  const built=await esbuild.build({entryPoints:[fileURLToPath(new URL('./packetDraftRecoveryWorker20261123.mjs',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',packages:'external',target:'node22'});
  const worker=built.outputFiles[0].text;if(worker.includes('_PTARG_'))throw Error('WORKER_ARGUMENT_SEPARATOR_COLLISION');
  cloud(['run','jobs',exists(['run','jobs','describe',account,`--region=${region}`])?'update':'create',account,`--region=${region}`,`--image=${image}`,`--service-account=${serviceAccount}`,
   '--set-cloudsql-instances=ptonboard-dev:us-west3:ptonboard-mysql','--command=node',`--args=^_PTARG_^--input-type=module_PTARG_--eval_PTARG_${worker}`,
   `--set-env-vars=DB_SOCKET=/cloudsql/ptonboard-dev:us-west3:ptonboard-mysql,DB_NAME=${database},DB_USER=${databaseUser},PLAN_HASH=${hash},APPLY_CHANGES=false,PTONBOARDFILES=${env.PTONBOARDFILES},REFERRAL_KMS_KEY=${rows[0].encryption_key_id}`,
   `--set-secrets=DB_PASSWORD=${secret}:latest`,'--tasks=1','--parallelism=1','--max-retries=0','--task-timeout=1800s','--memory=2Gi','--cpu=2','--format=value(metadata.name)']);
  fs.writeFileSync(new URL('automation-configuration.json',evidence),JSON.stringify({...summary,configured:true,applied:false,job:account,image,secretReference:`${secret}:latest`,boundaryChecks:{directClientReadDenied:deniedSelect,unapprovedDraftDenied:deniedScope}},null,2)+'\n');
  progress('configured_not_executed');
 }
}catch(error){console.error(JSON.stringify({step:'failed',code:typeof error.code==='string'?error.code:String(error.message||'CONFIGURATION_FAILED').replace(/[^A-Z_]/g,'').slice(0,80),cloudAction:error.cloudAction,detail:error.safeDetail}));process.exitCode=1;}
finally{if(db)await db.end();password=null;}
