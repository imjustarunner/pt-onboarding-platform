import pool from '../config/database.js';
import {chartSections,readChartRecord} from './clientChartImport.service.js';
import {billingHandoffTaskIds,insuranceDraftSlots} from './clientChartRecordRead.service.js';
import {markRecordsClientCurrent,readRecordsClientStatus} from './clientRecordsStatus.service.js';
const fail=(status,message)=>Object.assign(Error(message),{status});
const object=value=>typeof value==='string'?JSON.parse(value):value||{};
async function current(scope,db){
 const[[row]]=await db.execute("SELECT JSON_EXTRACT(onboarding_docs_json,'$.recordsImport') AS import_state FROM clients WHERE id=? AND agency_id=? FOR UPDATE",[scope.clientId,scope.agencyId]);
 if(!row)throw fail(404,'Client not found in this agency.');
 return object(row.import_state);
}
async function write(scope,state,db,expectedRevision){
 const[result]=await db.execute("UPDATE clients SET onboarding_docs_json=JSON_SET(COALESCE(onboarding_docs_json,JSON_OBJECT()),'$.recordsImport',CAST(? AS JSON)) WHERE id=? AND agency_id=? AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(onboarding_docs_json,'$.recordsImport.revision')) AS UNSIGNED),0)=?",[JSON.stringify(state),scope.clientId,scope.agencyId,expectedRevision]);
 if(Number(result.affectedRows)!==1)throw fail(409,'This records import changed in another window. Reload its saved progress before finishing.');
 return state;
}
export async function beginClientChartImport(scope,sections,actorId,{db=pool,selectedSections=null,onlyIncomplete=false}={}){
 if(!Array.isArray(sections)||sections.length>chartSections.length||sections.some(key=>!chartSections.includes(key)))throw fail(400,'Choose valid record sections to import.');
 const previous=await current(scope,db);
 if(onlyIncomplete&&previous.status==='complete')throw fail(409,'Records import was completed in another window. Open the chart to review it.');
 if(selectedSections!==null&&(!Array.isArray(selectedSections)||!selectedSections.length||selectedSections.some(key=>!chartSections.includes(key))))throw fail(400,'Select valid record sections to update.');
 const selection=selectedSections===null?(previous.status==='pending'?previous.selectedSections:null):[...new Set(selectedSections)];
 const revision=Number(previous.revision||0);
 return write(scope,{status:'pending',revision:revision+1,sections:[...new Set(sections)],...(selection?{selectedSections:[...new Set([...selection,...sections])]}:{}),startedAt:previous.startedAt||new Date().toISOString(),startedByUserId:previous.startedByUserId||actorId,updatedByUserId:actorId},db,revision);
}
export async function completeClientChartImport(scope,actorId,{db=pool,readRecord=null,allowedSections=chartSections,ifPending=false,keptBlankSections=[],inTransaction=false,setCurrent=markRecordsClientCurrent}={}){
 if(!inTransaction&&(db.getConnection||db.beginTransaction)){
  const connection=db.getConnection?await db.getConnection():db;
  try{await connection.beginTransaction();const result=await completeClientChartImport(scope,actorId,{db:connection,readRecord,allowedSections,ifPending,keptBlankSections,inTransaction:true,setCurrent});await connection.commit();return result;}
  catch(error){await connection.rollback();throw error;}finally{if(connection!==db)connection.release();}
 }
 readRecord ||= (scope,key,owner)=>readChartRecord(scope,key,owner,db);
 if(!Array.isArray(keptBlankSections)||keptBlankSections.some(key=>!allowedSections.includes(key)))throw fail(400,'Review the blank record sections before finishing.');
 const state=await current(scope,db);
 for(const key of keptBlankSections){const {value}=await readRecord(scope,key,actorId);if(value?.text?.trim()||Object.values(value?.coverageDrafts||{}).some(slot=>slot.text?.trim()))throw fail(409,'This section contains a saved paste. Import it or clear its draft before keeping it blank.');}
 if(!state.status&&ifPending)return null;
 if(state.status==='complete')return {...state,clientStatus:await readRecordsClientStatus(scope,db)};
 if(state.status!=='pending'||!Array.isArray(state.sections))throw fail(409,'Resume this chart’s saved import before finishing.');
 for(const key of state.sections){
  if(!allowedSections.includes(key))throw fail(403,'Account support access is required to finish these record sections.');
  const {value}=await readRecord(scope,key,actorId);
  let imported=value?.imported===true;
  if (key==='insurance') {
   const filled=Object.entries(insuranceDraftSlots(value)).filter(([,slot])=>slot.text?.trim());
   if (filled.length) {
    const remaining=filled.filter(([,slot])=>slot.imported!==true);
    const taskIds=remaining.length ? billingHandoffTaskIds(value,(await readRecord(scope,'insuranceHandoff',0)).value) : {};
    imported=remaining.every(([position])=>Boolean(taskIds[position]));
   }
  }
  if(!imported||value?.needsReview===true)throw fail(409,'Import and review every filled section before finishing this client.');
 }
 const revision=Number(state.revision||0);
 const completed=await write(scope,{...state,status:'complete',revision:revision+1,keptBlankSections:[...new Set(keptBlankSections)],completedAt:new Date().toISOString(),completedByUserId:actorId},db,revision);
 return {...completed,clientStatus:await setCurrent(scope,actorId,db,{importRevision:completed.revision})};
}
