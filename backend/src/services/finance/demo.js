import crypto from 'node:crypto';
import pool from '../../config/database.js';
import {encryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {fail,audit} from './policy.js';
export const DEMO_SLUG='rocky-mountain-mentors-demo';
export async function seedFinanceDemo({actorUserId=null,managerAgencyId=1}={},db=pool){
 const conn=await db.getConnection();let locked=false;
 try{
  const [[lock]]=await conn.execute("SELECT GET_LOCK('finance-demo-rocky-mountain-mentors',10) acquired");if(!lock.acquired)throw fail(409,'Demo setup is already running');locked=true;await conn.beginTransaction();
  const [[manager]]=await conn.execute('SELECT id FROM agencies WHERE id=?',[managerAgencyId]);if(!manager)throw fail(409,'Managing organization not found');
  const [[existing]]=await conn.execute('SELECT a.id,f.is_demo FROM agencies a LEFT JOIN finance_organizations f ON f.agency_id=a.id WHERE a.slug=?',[DEMO_SLUG]);
  if(existing){if(!existing.is_demo)throw fail(409,'The demo slug already belongs to a non-demo organization');await conn.commit();return {agencyId:existing.id,slug:DEMO_SLUG,existing:true};}
  const [agency]=await conn.execute('INSERT INTO agencies (name,slug,organization_type,color_palette,is_active,feature_flags) VALUES (?,?,?,?,1,?)',['Rocky Mountain Mentors — Demo Nonprofit',DEMO_SLUG,'agency',JSON.stringify({primary:'#176b66',secondary:'#183e54',accent:'#df9a47'}),JSON.stringify({financeOperationsEnabled:true})]);
  const agencyId=agency.insertId;
  await conn.execute("INSERT INTO finance_organizations (agency_id,enabled,mode,manager_agency_id,is_demo,fiscal_start_month) VALUES (?,1,'sponsored',?,1,1)",[agencyId,managerAgencyId]);
  const insert=async(table,fields)=>{const keys=Object.keys(fields),[r]=await conn.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(fields));return r.insertId;};
  const programNames=['Mentor Academy','Community Mentor Gatherings','One-to-One Youth Mentoring','Youth Experiences & Scholarships'];
  const programs=[];for(const [i,name] of programNames.entries())programs.push(await insert('finance_programs',{agency_id:agencyId,name,description:['Train mentors in boundaries, youth engagement, referral awareness and consistent support.','Bring mentors together for skill practice, peer support and community learning.','Provide structured mentoring sessions and youth-led goal setting.','Offer fictional youth experience scholarships for arts, outdoor learning and educational trips.'][i]}));
  const partners=[];for(const [i,name] of ['Demo Front Range Opportunity Foundation','Demo Mountain Futures Trust','Demo Youth Discovery Fund','Demo Summit Training Center','Demo Community Events Hall','Demo Outdoor Learning Co-op','Demo Arts Experience Studio','Demo Mentor Travel Pool'].entries())partners.push(await insert('finance_partners',{agency_id:agencyId,name,kind:i<3?'grantor':'vendor',contact:'demo@example.invalid',notes:'Fictional organization for demonstration. No real grant or contract.'}));
  const awards=[12000000,9000000,6500000],received=[10000000,7000000,5000000],grantNames=['Mentor Capacity & Community Grant — DEMO','Youth Mentoring Access Grant — DEMO','Experience Scholarship Grant — DEMO'],funds=[],grants=[];
  for(let i=0;i<3;i++){
   const fund=await insert('finance_funds',{agency_id:agencyId,name:grantNames[i].replace('Grant','Fund'),kind:'restricted',restrictions:['Mentor training and community gathering costs only.','Direct youth mentoring, supervision and participant access costs only.','Youth experience awards, approved educational trips and access supports only.'][i]});funds.push(fund);
   await insert('finance_receipts',{agency_id:agencyId,fund_id:fund,amount_cents:received[i],received_date:'2026-02-01',reference:`DEMO-GRANT-RECEIPT-${i+1}`,actor_user_id:actorUserId});
   grants.push(await insert('finance_grants',{agency_id:agencyId,fund_id:fund,partner_id:partners[i],name:grantNames[i],award_cents:awards[i],start_date:'2026-01-01',end_date:'2026-12-31',report_due:['2026-10-15','2026-11-01','2026-12-15'][i],restrictions:'DEMO terms: program-specific allowable costs, documented receipts, and quarterly activity reporting. No actual award exists.'}));
  }
  const budgets=[],allocations=[];
  for(let i=0;i<4;i++){
   const g=[0,0,1,2][i],budget=await insert('finance_budgets',{agency_id:agencyId,program_id:programs[i],fund_id:funds[g],grant_id:grants[g],name:`2026 ${programNames[i]}`,amount_cents:[7000000,5000000,9000000,6500000][i],start_date:'2026-01-01',end_date:'2026-12-31'});budgets.push(budget);
   allocations.push(await insert('finance_allocations',{agency_id:agencyId,budget_id:budget,name:`${programNames[i]} delivery`,amount_cents:[7000000,5000000,9000000,6500000][i]}));
  }
  const events=[];for(let i=0;i<12;i++)events.push(await insert('finance_events',{agency_id:agencyId,program_id:programs[i%4],name:[`Mentor Foundations Training ${Math.floor(i/4)+1}`,`Community Mentor Roundtable ${Math.floor(i/4)+1}`,`Youth Mentoring Cohort ${Math.floor(i/4)+1}`,`Discovery Experience Awards ${Math.floor(i/4)+1}`][i%4],kind:['training','event','mentoring','scholarship'][i%4],start_date:`2026-${String(3+Math.floor(i/4)*2).padStart(2,'0')}-10`,end_date:`2026-${String(3+Math.floor(i/4)*2).padStart(2,'0')}-12`,location:'Colorado Springs — fictional demo venue',description:'DEMO programming only. No participants are enrolled and no invitations are sent.',planned_participants:[24,35,40,18][i%4]}));
  const addDoc=async({expenseId=null,grantId=null,requestId=null,name,kind,body,visibility='organization'})=>{
   const buffer=Buffer.from(`FICTIONAL DEMO — NOT A REAL FINANCIAL DOCUMENT\nRocky Mountain Mentors demo nonprofit\n\n${body}\n`),documentId=await insert('finance_documents',{agency_id:agencyId,name,kind,mime:'text/plain',size_bytes:buffer.length,content_encrypted:'pending',sha256:crypto.createHash('sha256').update(buffer).digest('hex'),visibility,expense_id:expenseId,grant_id:grantId,request_id:requestId,uploaded_by_user_id:actorUserId});
   await conn.execute('UPDATE finance_documents SET content_encrypted=? WHERE id=?',[encryptFamilyBilling({base64:buffer.toString('base64')},`finance-document:${agencyId}:${documentId}`),documentId]);
  };
  const paid=[];
  for(let i=0;i<40;i++){
   const p=i%4,status=i<12?'paid':i<20?'approved':i<24?'scheduled':i<30?'submitted':i<34?'in_review':i<37?'needs_info':'draft',amount=[185000,92500,240000,125000,67500][i%5],when=`2026-${String(3+i%5).padStart(2,'0')}-${String(5+i%20).padStart(2,'0')}`;
   const expenseId=await insert('finance_expenses',{agency_id:agencyId,request_key:`demo-expense-${i+1}`,title:`${['Mentor training materials','Mentor gathering venue and meals','Mentoring service delivery','Youth experience scholarship'][p]} — ${i+1}`,description:'Fictional sample expense. No real vendor, child, reimbursement or payment is represented.',kind:p===3?'scholarship':i%5===0?'reimbursement':'vendor',program_id:programs[p],event_id:events[p],partner_id:partners[3+i%5],amount_cents:amount,expense_date:when,category:['Training','Events','Mentoring services','Experience scholarships'][p],status,requested_by_user_id:null,payment_reference:status==='paid'?`DEMO-PAYMENT-${i+1}`:null,payment_date:status==='paid'?when:null,quickbooks_reference:status==='paid'?`DEMO-QB-${i+1}`:null});
   await insert('finance_expense_splits',{expense_id:expenseId,agency_id:agencyId,allocation_id:allocations[p],amount_cents:amount});
   await insert('finance_expense_history',{agency_id:agencyId,expense_id:expenseId,actor_user_id:null,to_status:status,note:`Seeded ${status} example. No live payment or approval occurred.`});
   await addDoc({expenseId,name:`DEMO-${p===3?'award':'receipt'}-${i+1}.txt`,kind:p===3?'award':'receipt',body:`Sample evidence for expense ${i+1}. Amount: $${(amount/100).toFixed(2)}. Fictional example.`});
   if(status==='paid')paid.push({expenseId,amount,when,title:`DEMO payment ${i+1}`});
  }
  for(let i=0;i<3;i++){
   const requestId=await insert('finance_requests',{agency_id:agencyId,kind:'report',title:`Quarterly program report — ${grantNames[i]}`,description:'Upload a fictional program narrative, participation summary and expense explanation.',grant_id:grants[i],program_id:programs[i+1],due_date:['2026-10-15','2026-11-01','2026-12-15'][i],requested_by_user_id:actorUserId});
   await addDoc({grantId:grants[i],name:`DEMO-grant-agreement-${i+1}.txt`,kind:'grant_agreement',body:`Fictional award: $${awards[i]/100}. Grant period: January–December 2026. This is not an actual grant agreement.`});
  }
  await insert('finance_requests',{agency_id:agencyId,kind:'budget_change',title:'Add a winter mentor gathering',description:'Demo request to shift $2,500 within the mentor gathering program. Requires finance review; no automatic budget change.',program_id:programs[1],requested_by_user_id:actorUserId});
  await addDoc({name:'DEMO-sponsor-review-notes.txt',kind:'other',visibility:'internal',body:'Internal sponsor-only sample; intentionally hidden from the sponsored organization portal.'});
  const external=`fca_finance_demo_${agencyId}`,accountId=await insert('bank_feed_accounts',{agency_id:agencyId,external_id:external,stripe_customer_id:`cus_demo_${agencyId}`,livemode:0,status:'demo',sync_enabled:0,purpose:'finance_operations',details_encrypted:encryptFamilyBilling({institution:'Demo Bank — simulated',name:'Fictional operations account',last4:'0000'},`bank-account:${agencyId}:${external}`),connected_by_user_id:actorUserId||0});
  for(const [i,payment] of paid.entries()){
   const evidence={reference:`fctxn_demo_${agencyId}_${i}`,amountCents:-payment.amount,currency:'usd',description:payment.title,status:'posted',transactedAt:Date.parse(payment.when)/1000,postedAt:Date.parse(payment.when)/1000,updated:Date.parse(payment.when)/1000};
   await insert('finance_bank_entries',{agency_id:agencyId,account_id:accountId,external_id:evidence.reference,vendor_updated:evidence.updated,evidence_encrypted:encryptFamilyBilling(evidence,`finance-bank:${agencyId}:${accountId}`),evidence_hash:crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),expense_id:i<8?payment.expenseId:null,review_status:i<8?'matched':'unreviewed'});
  }
  await audit(conn,{agencyId,userId:actorUserId},'fictional_demo_seeded','organization',agencyId,{grants:3,awardCents:27500000,programs:4,events:12,expenses:40});
  await conn.commit();return {agencyId,slug:DEMO_SLUG,grants:3,awardCents:27500000,programs:4,events:12,expenses:40};
 }catch(e){await conn.rollback();throw e;}finally{if(locked)await conn.execute("SELECT RELEASE_LOCK('finance-demo-rocky-mountain-mentors')");conn.release();}
}
