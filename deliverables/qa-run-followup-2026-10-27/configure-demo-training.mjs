// Owner-run fixture setup. Uses the existing demo owner API account; never shares it with bots.
import fs from 'node:fs';
import path from 'node:path';
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const title='QA orientation — scheduling and support';
const userIds=[1433,1434,1438,1439];
if(!process.argv.includes('--apply')) {
  console.log(JSON.stringify({agencyId:450,title,userIds,clientCreation:false,passwordChanges:false,shared:false,public:false}));
} else {
  const dir=option('credentials-dir');if(!dir)throw Error('Provide --credentials-dir explicitly.');
  const account=JSON.parse(fs.readFileSync(path.join(dir,'setup.json')));
  if(Number(account.agencyId)!==450||!['setup','admin'].includes(account.role))throw Error('Expected the existing isolated demo owner account.');
  const base='https://app.itsco.health/api';let token;
  const call=async(method,url,body)=>{
    const r=await fetch(base+url,{method,redirect:'error',headers:{'Content-Type':'application/json',Origin:'https://app.itsco.health',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await r.json();}catch{throw Error(`${method} ${url}: HTTP ${r.status}`);}
    if(!r.ok)throw Error(`${method} ${url}: HTTP ${r.status}: ${data.error?.message||'Request failed'}`);return data;
  };
  const login=await call('POST','/auth/login',{email:account.username,password:account.password,organizationSlug:'auricwell-qa-demo'});
  if(login.user?.id!==1435||login.user?.role!=='admin')throw Error('Unexpected owner identity.');token=login.token;
  const agencies=await call('GET','/users/me/agencies');
  if(!agencies.some(a=>Number(a.id)===450)||agencies.some(a=>![450,451,452].includes(Number(a.id))))throw Error('Unexpected owner organization scope.');
  const staff=await call('GET','/staff/directory?agencyId=450');
  const rows=Array.isArray(staff)?staff:(staff.staff||staff.users||[]);
  if(userIds.some(id=>!rows.some(u=>Number(u.id)===id)))throw Error('Demo training recipients are not all in the demo directory.');
  const modules=await call('GET','/modules');
  let module=modules.find(m=>Number(m.agency_id)===450&&m.title===title);
  if(!module)module=await call('POST','/modules',{agencyId:450,title,description:'Synthetic practice course for testing lesson reading, quiz scoring, retry and completion. Not professional certification.',isActive:false,isPublic:false,isAlwaysAccessible:false,isStandalone:true,estimatedTimeMinutes:5});
  if(Number(module.agency_id)!==450||module.is_shared||module.is_public)throw Error('Unexpected module scope.');
  const content=await call('GET',`/modules/${module.id}/content`);
  if(!content.some(c=>c.content_type==='text'))await call('POST',`/modules/${module.id}/content`,{contentType:'text',orderIndex:0,title:'Working in the demo agency',contentData:{content:'<h2>Scheduling and support practice</h2><p>Work only in AuricWell QA Mental Health — DEMO. Use synthetic clients and a separate browser context for each person.</p><p>Support coordinates scheduling, client contact and paperwork. Support can inspect documentation status but cannot read clinical note bodies or change agency settings.</p><p>A confirmation screen alone does not prove email delivery. Check the recorded email in the intended recipient’s inbox and the copy at testing@itsco.health. Include the reference number and screenshot in a failure report.</p>'}});
  if(!content.some(c=>c.content_type==='quiz'))await call('POST',`/modules/${module.id}/content`,{contentType:'quiz',orderIndex:1,title:'Practice check',contentData:{title:'Demo coordination check',minimumScore:100,allowRetake:true,maxAttempts:10,questions:[
    {type:'multiple_choice',question:'Where should synthetic clients be created?',options:['Any real school','AuricWell QA Mental Health — DEMO','A provider’s real caseload'],correctAnswer:1,explanation:'Synthetic clients stay inside the isolated demo organization.'},
    {type:'multiple_choice',question:'Which activity belongs to the support role?',options:['Read clinical progress-note bodies','Change agency security settings','Schedule an appointment and record a contact note'],correctAnswer:2,explanation:'Support coordinates care while clinical note content and administrative settings remain restricted.'},
    {type:'multiple_choice',question:'What proves the email portion of the test?',options:['The screen says submitted','Check the recipient email record and external testing inbox','A provider has signed in'],correctAnswer:1,explanation:'Verify both the intended recipient’s recorded email and delivery to testing@itsco.health.'}
  ]}});
  if(module.publish_status!=='published'||!module.is_active)await call('PUT',`/modules/${module.id}`,{agencyId:450,publishStatus:'published',isActive:true});
  await call('POST','/agency-on-demand-training/module',{agencyId:450,moduleId:module.id});
  const missing=[];
  for(const id of userIds){const tasks=await call('GET',`/tasks/all?taskType=training&assignedToUserId=${id}`);if(!tasks.some(t=>Number(t.reference_id)===Number(module.id)))missing.push(id);}
  const assigned=missing.length?await call('POST',`/modules/${module.id}/assign`,{agencyId:450,userIds:missing,title:`Complete ${title}`}):{tasksCreated:0,tasks:[]};
  const result={at:new Date().toISOString(),agencyId:450,moduleId:module.id,title,userIds,tasksCreated:assigned.tasksCreated,taskIds:assigned.tasks.map(t=>t.id),url:`https://app.itsco.health/auricwell-qa-demo/module/${module.id}`};
  if(option('output'))fs.writeFileSync(option('output'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
