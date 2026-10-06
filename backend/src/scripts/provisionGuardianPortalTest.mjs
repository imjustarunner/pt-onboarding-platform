// Explicit opt-in fixture: creates only fictional, demo-marked guardian/client records.
// Never sends invitations, messages or appointment reminders. Links are written to a private file.
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { PDFDocument, StandardFonts } from 'pdf-lib';
if (!process.argv.includes('--apply')) throw new Error('Use --apply to create a fictional ITSCO test family.');
const output = process.env.GUARDIAN_TEST_OUTPUT;
if (!output || !output.startsWith('/')) throw new Error('Set GUARDIAN_TEST_OUTPUT to a private absolute file path outside the repository.');
dotenv.config({path:process.env.GUARDIAN_TEST_ENV_FILE || 'backend/.env'});
const {encryptFamilyBilling}=await import('../services/familyBillingEncryption.service.js');
const {default:StorageService}=await import('../services/storage.service.js');
const db=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'+00:00'});
const run=crypto.randomBytes(5).toString('hex'),expiresAt=new Date(Date.now()+72*3600000);
const timestamp=d=>d.toISOString().slice(0,19).replace('T',' ');
const created={run,expiresAt:expiresAt.toISOString(),guardians:[],clients:[],storagePaths:[]};
try {
 await db.beginTransaction();
 const [[agency]]=await db.execute("SELECT id FROM agencies WHERE slug='itsco' AND organization_type='agency' AND is_active=1");
 const [[actor]]=await db.execute("SELECT id FROM users WHERE LOWER(email)='michael@plottwistco.com' AND role='super_admin' AND is_active=1");
 if(!agency||!actor)throw new Error('Expected ITSCO and the requesting administrator were not found.');
 for(const firstName of ['Alex','Jordan']){
  const token=crypto.randomBytes(32).toString('hex'),email=`guardian-test-${run}-${firstName.toLowerCase()}@example.invalid`;
  const hash=await bcrypt.hash(crypto.randomBytes(32).toString('hex'),12);
  const [row]=await db.execute("INSERT INTO users (email,personal_email,first_name,last_name,role,status,is_active,is_demo,password_hash,passwordless_token,passwordless_token_expires_at,passwordless_token_purpose,status_expires_at) VALUES (?,?,?,'Testfamily','client_guardian','ACTIVE_EMPLOYEE',1,1,?,?,?,'setup',?)",[email,email,firstName,hash,token,timestamp(expiresAt),timestamp(expiresAt)]);
  await db.execute('INSERT INTO user_agencies (user_id,agency_id) VALUES (?,?)',[row.insertId,agency.id]);
  created.guardians.push({id:row.insertId,name:`${firstName} Testfamily`,email,url:`https://app.itsco.health/passwordless-login/${token}`});
 }
 for(const [firstName,dob] of [['Robin','2017-06-15'],['Casey','2015-08-20']]){
  const [row]=await db.execute("INSERT INTO clients (organization_id,agency_id,initials,full_name,date_of_birth,status,submission_date,document_status,guardian_portal_enabled,client_type,source,is_demo,created_by_user_id) VALUES (?, ?, ?, ?, ?, 'ACTIVE',UTC_DATE(),'PACKET',1,'clinical','ADMIN_CREATED',1,?)",[agency.id,agency.id,`${firstName.slice(0,3).toUpperCase()}TES`,`${firstName} Testfamily — TEST ONLY`,dob,actor.id]);
  created.clients.push({id:row.insertId,name:firstName});
 }
 const [link]=await db.execute("INSERT INTO intake_links (public_key,title,scope_type,organization_id,is_active,create_guardian) VALUES (?,?,'agency',?,0,0)",[crypto.randomBytes(24).toString('hex'),`Guardian portal TEST ONLY ${run}`,agency.id]);created.intakeLinkId=link.insertId;
 const [template]=await db.execute("INSERT INTO document_templates (name,template_type,created_by_user_id) VALUES (?,'html',?)",[`TEST ONLY — Guardian portal sample ${run}`,actor.id]);created.templateId=template.insertId;
 for(const [index,guardian] of created.guardians.entries())for(const client of (index===0?created.clients:[created.clients[0]])){
  await db.execute("INSERT INTO client_guardians (client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id) VALUES (?,?,'guardian','Test guardian',1,?,?)",[client.id,guardian.id,JSON.stringify({canViewDocs:true,canSignDocs:true,canViewLinks:true,canViewProgress:true,canMessage:true,testRun:run}),actor.id]);
  const scopes=['treatment_plan','approve_goals','session_frequency','safety_plan','clinical_documents','clinical_messages'];
  await db.execute("INSERT INTO guardian_clinical_grants (agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,evidence_encrypted,reviewed_by_user_id,review_due_date) VALUES (?,?,?,'full',1,'legal_representative',?,?,?,?)",[agency.id,client.id,guardian.id,JSON.stringify(scopes),encryptFamilyBilling({reason:'Fictional test fixture; no real medical authorization',testRun:run},`clinical-grant:${agency.id}:${client.id}:${guardian.id}`),actor.id,expiresAt.toISOString().slice(0,10)]);
  const [submission]=await db.execute("INSERT INTO intake_submissions (intake_link_id,guardian_user_id,client_id,status) VALUES (?,?,?,'completed')",[link.insertId,guardian.id,client.id]);
  const pdf=await PDFDocument.create(),page=pdf.addPage();const font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const [line,text] of ['TEST ONLY - NOT A REAL SIGNED CONSENT',`Child: ${client.name} Testfamily`,`Guardian: ${guardian.name}`,'This sample verifies guardian-specific document download.','No real patient information is present.'].entries())page.drawText(text,{x:40,y:740-line*30,size:12,font});
  const bytes=Buffer.from(await pdf.save());const saved=await StorageService.saveIntakeBundle({submissionId:submission.insertId,fileBuffer:bytes,filename:`guardian-test-${run}-${guardian.id}-${client.id}.pdf`});created.storagePaths.push(saved.relativePath);
  await db.execute('INSERT INTO intake_submission_documents (intake_submission_id,document_template_id,client_id,signed_pdf_path,pdf_hash,signed_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())',[submission.insertId,template.insertId,client.id,saved.relativePath,crypto.createHash('sha256').update(bytes).digest('hex')]);
 }
 await db.commit();
 fs.writeFileSync(output,JSON.stringify(created,null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({created:true,guardians:created.guardians.map(g=>g.id),clients:created.clients.map(c=>c.id),expiresAt:created.expiresAt,privateLinksFile:output}));
} catch(error){await db.rollback();console.error('Guardian test fixture failed:',error.code||error.message);process.exitCode=1;}
finally{await db.end();const {default:pool}=await import('../config/database.js');await pool.end();}
