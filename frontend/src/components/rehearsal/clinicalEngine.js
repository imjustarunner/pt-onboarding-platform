// Isolated browser memory only. This transport has no fetch/axios fallback.
export function createClinicalRehearsalEngine(bundle) {
 const copy=value=>JSON.parse(JSON.stringify(value));
 const fail=message=>{throw new Error(message);};
 const today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let documents=[],nextId=1,nextSigner=1,recipient=21;
 const recipients=[{id:21,kind:'client',name:'Alex Example'},{id:22,kind:'guardian',name:'Jordan Example'}];
 const base={personLabel:'Alex Example · Fictional',planDate:today};
 const examples={
  'safety-plan':{...base,thoughts:'Example: noticing thoughts that a school task feels impossible.',behaviors:'Example: becoming quiet and leaving a task unfinished.',mood:'Example: feeling overwhelmed.',coping:'Example: use a practiced grounding exercise and ask for a pause.',selfCare:'Example: a snack and quiet time after school.',supports:[{name:'Jordan Example',phone:'719-555-0101',role:'Fictional caregiver'}],safePlaces:'Example: quiet room with a trusted adult.',unsafeItems:'Example: caregiver secures unsafe items; review the actual environment together.',medications:'Example: caregiver stores and manages medication.',safetyResponsibility:'Jordan Example · Review together today.',professionals:[{name:'988 Suicide & Crisis Lifeline',phone:'988',details:'Call or text.'}],familyNotification:'Example: involve the authorized caregiver as agreed.',reviewPlan:'Example: responsible clinician reviews at the next contact.',copyProvided:'Fictional client portal'},
  'release-of-information':{...base,birthDate:'2013-04-12',guardianName:'Jordan Example',representativeAuthority:'Fictional parent',recipientName:'Example School Support Team',recipientPhone:'719-555-0102',direction:['Discuss information with the named recipient'],purpose:'Example: coordinate agreed classroom supports.',information:['Summary of sessions and treatment'],expirationEvent:'At the end of this fictional school year.'},
  'client-information-update':{...base,legal_first_name:'Alex',legal_last_name:'Example',preferred_name:'Alex',phone_number:'719-555-0100',email_address:'alex@example.test',address_city:'Colorado Springs',address_state:'CO',emergency_contact_name:'Jordan Example',emergency_contact_phone:'719-555-0101',updateNotes:'Example: afternoon contact works best.'},
  'attendance-verification':{...base,appointmentDate:today,startTime:'10:00',endTime:'10:50',timezone:'America/Denver',location:'437 Windchime Place, Colorado Springs',attendanceStatus:'Confirmed attended',excuseRequested:'Yes',issuerName:'Taylor Example',issuerTitle:'Facilitator',contactPhone:'719-555-0103'}
 };
 function fresh(key,data){const id=nextId++;const r={id,agencyId:bundle.agency.id,clientId:41,documentKey:key,version:1,currentVersion:1,contentHash:`rehearsal-${id}-1`,data:copy(data),template:copy(bundle.templates[key]),branding:copy(bundle.branding),signers:[],history:[{version:1,created_at:new Date().toISOString()}],recipients:copy(recipients),reviewStatus:key==='client-information-update'?'pending':null};documents.push({current:r,versions:[copy(r)]});return r;}
 function reset(){documents=[];nextId=1;nextSigner=1;for(const [key,data] of Object.entries(examples))fresh(key,data);}
 function find(id){return documents.find(d=>d.current.id===Number(id))||fail('Choose a rehearsal document.');}
 function view(d,version){const r=copy(version?d.versions.find(r=>r.version===Number(version))||d.current:d.current);r.currentVersion=d.current.version;r.history=copy(d.current.history);r.revocation=d.current.revocation;return r;}
 function persist(d){d.versions[d.current.version-1]=copy(d.current);return view(d);}
 function revise(d,data){d.current={...copy(d.current),data:copy(data),version:d.current.version+1,currentVersion:d.current.version+1,signers:[]};d.current.contentHash=`rehearsal-${d.current.id}-${d.current.version}`;d.current.history.unshift({version:d.current.version,created_at:new Date().toISOString()});return persist(d);}
 function share(id){for(const d of documents)for(const v of d.versions){const s=v.signers.find(s=>s.id===Number(id)&&s.userId===recipient&&!s.revokedAt);if(s)return {d,v,s};}fail('This copy is not shared with the selected fictional person.');}
 function sharedView(id){const {d,v,s}=share(id);return {...view(d,v.version),mySignerId:s.id};}
 async function request(method,url,body={},options={}) {
  const path=url.replace(/^\/clinical-forms/,'');
  if(method==='GET'&&path==='/template')return {template:copy(bundle.templates[options.params?.documentKey||'safety-plan']),catalog:bundle.clinicalFormCatalog,branding:bundle.branding,client:{id:41,name:base.personLabel}};
  if(method==='GET'&&path==='')return {plans:documents.map(({current:r})=>({id:r.id,clientId:41,name:r.data.personLabel,documentKey:r.template.key,title:r.template.title,version:r.version}))};
  if(method==='GET'&&path==='/portal')return {shares:documents.flatMap(d=>d.versions.flatMap(v=>v.signers.filter(s=>s.userId===recipient&&s.sharedAt&&!s.revokedAt).map(s=>({id:s.id,planId:v.id,version:v.version,title:v.template.title})))).reverse()};
  const portal=path.match(/^\/portal\/(\d+)(?:\/(.+))?$/);
  if(portal){if(method==='GET')return sharedView(portal[1]);const {d,v,s}=share(portal[1]);if(v.version!==d.current.version||Number(body.version)!==d.current.version)fail('Open the current rehearsal version first.');if(portal[2]==='revoke-authorization'){revise(d,d.current.data);d.current.revocation={recordedAt:new Date().toISOString(),reason:body.reason};persist(d);return sharedView(portal[1]);}if(portal[2]==='submit-update'){if(!body.consent||!body.signature)fail('Review and sign this update.');revise(d,body.data);d.current.reviewStatus='pending';d.current.signers=[{...copy(s),id:nextSigner++,signedAt:new Date().toISOString(),evidence:{name:body.name,signature:body.signature},method:'portal'}];persist(d);return {saved:true};}if(portal[2]==='sign'){if(s.copyOnly||s.signedAt||!body.consent||!body.signature)fail('Review the signing request.');const current=d.current.signers.find(x=>x.id===s.id);Object.assign(current,{signedAt:new Date().toISOString(),evidence:{name:body.name,signature:body.signature},method:'portal'});persist(d);return {signed:true};}fail('That action is not part of the rehearsal.');}
  if(method==='POST'&&path==='')return fresh(body.documentKey,body.data);
  const m=path.match(/^\/(\d+)(?:\/(.+))?$/);if(!m)fail('That action is not part of the rehearsal.');const d=find(m[1]);
  if(method==='GET')return view(d,options.params?.version);
  if(Number(body.version)!==d.current.version)fail('The rehearsal version changed. Reload it.');
  if(method==='PUT')return revise(d,body.data);
  if(m[2]==='signers'){
   if(body.kind==='guardian'&&!body.authorityConfirmed)fail('Confirm representative authority.');
   if(d.current.template.key==='attendance-verification'&&body.kind!=='clinician'&&!d.current.signers.some(s=>s.kind==='clinician'&&s.signedAt))fail('Sign as staff before sharing the attendance copy.');
   d.current.signers.push({id:nextSigner++,kind:body.kind,name:body.name||recipients.find(r=>r.id===Number(body.userId))?.name||'Example Signer',userId:Number(body.userId)||null,copyOnly:body.copyOnly,sharedAt:body.userId?new Date().toISOString():null});return persist(d);
  }
  const signer=m[2]?.match(/^signers\/(\d+)\/(sign|revoke)$/);
  if(signer){const s=d.current.signers.find(s=>s.id===Number(signer[1]));if(!s)fail('Select a rehearsal signer.');if(signer[2]==='revoke'){s.revokedAt=new Date().toISOString();return persist(d);}if(s.signedAt||s.copyOnly||!body.consent||!body.signature||(s.kind!=='clinician'&&!body.witnessConfirmed))fail('Review and complete the signature confirmations.');Object.assign(s,{signedAt:new Date().toISOString(),evidence:{name:body.name,signature:body.signature},method:s.kind==='clinician'?'staff':'in_person'});persist(d);return {signed:true};}
  if(m[2]==='review-update'){revise(d,d.current.data);d.current.reviewStatus='reviewed';return persist(d);}
  if(m[2]==='revoke-authorization'){revise(d,d.current.data);d.current.revocation={recordedAt:new Date().toISOString(),reason:body.reason};return persist(d);}
  fail('That action is not part of the rehearsal.');
 }
 reset();
 const invoke=async(...args)=>({data:copy(await request(...args))});
 return {get:(url,options)=>invoke('GET',url,{},options),post:(url,body)=>invoke('POST',url,body),put:(url,body)=>invoke('PUT',url,body),reset,setRecipient:id=>{recipient=Number(id);}};
}
