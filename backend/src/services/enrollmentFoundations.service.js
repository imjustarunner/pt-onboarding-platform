import {createHash} from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import pool from '../config/database.js';
import {assertEnrollmentAgencyMembership} from './enrollmentAgencyAccess.service.js';

const error=(message,status=400)=>Object.assign(new Error(message),{status});
export function foundationContext({agencyId,channel='school',locale='en',audience='guardian'}={}) {
 const id=Number(agencyId);
 if(!Number.isSafeInteger(id)||id<=0)throw error('Choose an organization.');
 if(!['school','office','tutoring'].includes(channel)||!['en','es'].includes(locale))throw error('Choose a supported document collection and language.');
 if(channel==='office'&&!['self','guardian'].includes(audience))throw error('Choose who is enrolling.');
 return {agencyId:id,channel,locale,audience:channel==='office'?audience:'all'};
}
export async function assertFoundationAccess(user,agencyId,{edit=false}={}) {
 if(!user?.id||user.demoMode||user.switchedFromUserId)throw error('Use your own staff account.',403);
 const roles=['super_admin','admin','provider','provider_plus','intern','intern_plus','supervisor','facilitator','qbha','clinical_practice_assistant','support','staff'];
 if(!roles.includes(user.role)||edit&&!['admin','super_admin'].includes(user.role))throw error(edit?'Only agency administrators can edit enrollment foundation documents.':'Enrollment documents are available to authorized staff.',403);
 await assertEnrollmentAgencyMembership(user,agencyId);
}
const headingText=html=>sanitizeHtml(html,{allowedTags:[],allowedAttributes:{}}).replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
const slug=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
function keyFor(title){
 const s=slug(title);
 if(/intake-questionnaire|cuestionario-de-(admision|ingreso)|enrollment-questionnaire/.test(s))return 'intake-questionnaire';
 if(/consent-to-release|consentimiento-para-(divulgar|liberar|la-divulgacion)|release-of-information/.test(s))return 'school-roi';
 if(/acknowledgement-and-consent-summary|acknowledgment-and-consent-summary|resumen-de-(reconocimiento|consentimiento)/.test(s))return 'consent-summary';
 if(/insurance-information|informacion-del-seguro/.test(s))return 'insurance-information';
 if(/minor-consent|consentimiento-(de|del|para)-menor/.test(s))return 'minor-consent';
 if(/informed-consent|consentimiento-informado/.test(s))return 'informed-consent';
 if(/group-consent|consentimiento-grupal/.test(s))return 'group-consent';
 if(/policy-and-services|politicas-y-servicios/.test(s))return 'policy-services';
 if(/client-rights|derechos-del-cliente/.test(s))return 'client-rights';
 if(/mental-health-professional-information|informacion-del-profesional|professional-disclosure/.test(s))return 'disclosure';
 if(/hipaa|notice-of-privacy-practices|aviso-de-practicas-de-privacidad/.test(s))return 'hipaa-notice';
 if(/^(signatures|firmas)$/.test(s))return 'signatures';
 return s||'document';
}
const generated=new Set(['intake-questionnaire','consent-summary','signatures']);
const digest=value=>createHash('sha256').update(value).digest('hex');
/** Preserve the existing agency shell. Only text before system-owned tokens is editable. */
export function splitFoundationDocuments(html=''){
 const source=String(html),headings=[...source.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/gi)],counts=new Map();
 return headings.map((heading,index)=>{
  const title=headingText(heading[2]),baseKey=keyFor(title),n=(counts.get(baseKey)||0)+1;counts.set(baseKey,n);
  const key=n===1?baseKey:`${baseKey}-${n}`,start=heading.index,end=headings[index+1]?.index??source.length;
  const contentStart=start+heading[0].length;
  let body=source.slice(contentStart,end),tail='';
  // Closing outer wrappers and page separators belong to the packet shell.
  const trailing=body.match(/((?:\s*<div[^>]*class=["'][^"']*page-break[^"']*["'][^>]*>\s*<\/div>|\s*<\/section>)\s*)+$/i);
  if(trailing){tail=trailing[0];body=body.slice(0,-tail.length);}
  let token=body.search(/\{\{(?:DISCLOSURE_CARE_TEAM|SCHOOL_STAFF_TABLE)\}\}/);
  if (token >= 0) {
    const wrapper = body.slice(0, token).match(/<(?:p|div)\b[^>]*>\s*$/i);
    if (wrapper) token = wrapper.index;
  }
  const protectedHtml=token<0?'':body.slice(token),editableHtml=token<0?body:body.slice(0,token);
  const requiredToken=baseKey==='disclosure'?'{{DISCLOSURE_CARE_TEAM}}':baseKey==='school-roi'?'{{SCHOOL_STAFF_TABLE}}':null;
  const protectedSourceError=requiredToken&&!body.includes(requiredToken)?`The "${title}" source is missing its automatic ${baseKey==='disclosure'?'provider':'school staff'} roster. An administrator must restore ${requiredToken} in the source template before this document can be edited or used.`:'';
  const editable=!protectedSourceError&&!generated.has(baseKey)&&heading[1]==='2';
  return {key,title,editable,editableHtml:editable?editableHtml.trim():'',html:source.slice(start,end),protectedHtml,requiredToken,protectedSourceError,protectedNote:protectedSourceError||(token>=0?(baseKey==='disclosure'?'Provider information below is generated from current agency records and cannot be edited here.':'School staff and authorization fields are generated for the selected school and retained automatically.'):(editable?'':'Generated from the current enrollment form. Edit its source questions in enrollment settings.')),start,end,headingHtml:heading[0],tail,originalEditableHtml:editableHtml};
 });
}
async function overrides(context,db=pool){const [rows]=await db.execute('SELECT * FROM enrollment_foundation_documents WHERE agency_id=? AND channel=? AND locale=? AND audience=?',[context.agencyId,context.channel,context.locale,context.audience]);return new Map(rows.map(row=>[row.document_key,row]));}
function project(document,row){
 const replacement=row&&document.editable?row.content_html:document.originalEditableHtml;
 const html=row&&document.editable?`${document.headingHtml}${replacement}${document.protectedHtml}${document.tail}`:document.html;
 return {...document,html,editableHtml:document.editable?replacement.trim():'',version:Number(row?.version||0),hash:digest(html)};
}
export async function listFoundationDocuments({html,...input}){const context=foundationContext(input),saved=await overrides(context);return splitFoundationDocuments(html).map(doc=>project(doc,saved.get(doc.key)));}
export function assertProtectedFoundationSource(document){if(document?.protectedSourceError)throw error(document.protectedSourceError,409);}
export async function applyEnrollmentFoundationOverrides({html,...input}){
 const docs=await listFoundationDocuments({html,...input});let result=String(html||'');for(const doc of [...docs].reverse()){assertProtectedFoundationSource(doc);result=result.slice(0,doc.start)+doc.html+result.slice(doc.end);}return result;
}
export async function saveFoundationDocument(user,{key,html,version,sourceHtml,...input}){
 const context=foundationContext(input);await assertFoundationAccess(user,context.agencyId,{edit:true});
 const original=splitFoundationDocuments(sourceHtml).find(doc=>doc.key===key);
 assertProtectedFoundationSource(original);
 if(!original||!original.editable)throw error('This section is generated and cannot be edited here.',403);
 if(!Number.isInteger(version)||version<0)throw error('Reload the document before saving.',409);
 if(typeof html!=='string'||!html.trim()||html.length>180000)throw error('Enter document text up to 180,000 characters.');
 if(/\{\{(?:DISCLOSURE_CARE_TEAM|SCHOOL_STAFF_TABLE)\}\}/i.test(html))throw error('Provider and school staff information is generated automatically. Edit only the introduction.');
 const clean=sanitizeHtml(html,{allowedTags:['p','div','span','br','hr','h3','h4','strong','b','em','i','u','ul','ol','li','blockquote','table','thead','tbody','tr','th','td','a'],allowedAttributes:{a:['href','title'],td:['colspan','rowspan'],th:['colspan','rowspan']},allowedSchemes:['https','http','mailto','tel'],allowProtocolRelative:false});
 if(!headingText(clean))throw error('The document must contain readable text.');
 const db=await pool.getConnection();
 try{await db.beginTransaction();const [[existing]]=await db.execute('SELECT * FROM enrollment_foundation_documents WHERE agency_id=? AND channel=? AND locale=? AND audience=? AND document_key=? FOR UPDATE',[context.agencyId,context.channel,context.locale,context.audience,key]);
  if(Number(existing?.version||0)!==version)throw error('Someone updated this document. Reload it before saving.',409);
  let id=existing?.id;const nextVersion=version+1;
  if(existing)await db.execute('UPDATE enrollment_foundation_documents SET content_html=?,version=?,updated_by_user_id=? WHERE id=?',[clean,nextVersion,user.id,id]);
  else{const [insert]=await db.execute('INSERT INTO enrollment_foundation_documents(agency_id,channel,locale,audience,document_key,content_html,version,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?)',[context.agencyId,context.channel,context.locale,context.audience,key,clean,nextVersion,user.id]);id=insert.insertId;}
  await db.execute('INSERT INTO enrollment_foundation_document_versions(document_id,version,content_html,actor_user_id) VALUES(?,?,?,?)',[id,nextVersion,clean,user.id]);await db.commit();
  return project(original,{content_html:clean,version:nextVersion});
 }catch(e){await db.rollback();if(e.code==='ER_DUP_ENTRY')throw error('Someone updated this document. Reload it before saving.',409);throw e;}finally{db.release();}
}
