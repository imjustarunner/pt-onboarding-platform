import crypto from 'node:crypto';
import pool from '../../config/database.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {fail,id,text,related,audit,transaction} from './policy.js';
export function validateFile(file){
 if(!file?.buffer?.length||file.buffer.length>5*1024*1024)throw fail(400,'Upload a document up to 5 MB');
 const b=file.buffer,kind=file.mimetype;
 const valid=kind==='application/pdf'?b.subarray(0,5).toString()==='%PDF-':kind==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):kind==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:['text/plain','text/csv'].includes(kind)?!b.includes(0):false;
 if(!valid)throw fail(400,'Use a PDF, PNG, JPEG, plain-text or CSV document with matching file contents');
 return {name:text(file.originalname.replace(/[\r\n"/\\]/g,'_'),255),mime:kind,size:b.length,hash:crypto.createHash('sha256').update(b).digest('hex')};
}
export async function uploadDocument(scope,input,file,db=pool){if(scope.role==='viewer')throw fail(403,'Read-only access');const validated=validateFile(file);return transaction(scope,async conn=>{
 const program=await related(conn,'finance_programs',input.programId,scope.agencyId,true),grant=await related(conn,'finance_grants',input.grantId,scope.agencyId,true),expense=await related(conn,'finance_expenses',input.expenseId,scope.agencyId,true),request=await related(conn,'finance_requests',input.requestId,scope.agencyId,true);
 if(!['receipt','invoice','award','grant_agreement','report','statement','contract','other'].includes(input.kind))throw fail(400,'Choose a document type');
 if(expense&&scope.role!=='manager'&&Number(expense.requested_by_user_id)!==scope.userId)throw fail(403,'You may attach evidence to your own expense requests');
 if(program&&expense&&expense.program_id!==program.id)throw fail(400,'The document’s program and expense must match');
 const visibility=scope.role==='manager'&&input.visibility==='internal'?'internal':'organization';
 const [r]=await conn.execute('INSERT INTO finance_documents (agency_id,name,kind,mime,size_bytes,content_encrypted,sha256,visibility,program_id,grant_id,expense_id,request_id,uploaded_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[scope.agencyId,validated.name,input.kind,validated.mime,validated.size,'pending',validated.hash,visibility,program?.id||null,grant?.id||null,expense?.id||null,request?.id||null,scope.userId]);
 const encrypted=encryptFamilyBilling({base64:file.buffer.toString('base64')},`finance-document:${scope.agencyId}:${r.insertId}`);
 await conn.execute('UPDATE finance_documents SET content_encrypted=? WHERE id=? AND agency_id=?',[encrypted,r.insertId,scope.agencyId]);await audit(conn,scope,'uploaded','document',r.insertId,{sha256:validated.hash,visibility});return {id:r.insertId};
 },db);}
export async function downloadDocument(scope,documentId,db=pool){const doc=await related(db,'finance_documents',documentId,scope.agencyId);if(scope.role!=='manager'&&doc.visibility!=='organization')throw fail(404,'Document not available');const value=decryptFamilyBilling(doc.content_encrypted,`finance-document:${scope.agencyId}:${doc.id}`);await audit(db,scope,'downloaded','document',doc.id);return {name:doc.name,mime:doc.mime,buffer:Buffer.from(value.base64,'base64')};}
