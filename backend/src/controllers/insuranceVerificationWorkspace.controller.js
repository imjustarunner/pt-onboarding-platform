import pool from '../config/database.js';
import { billingWorkspaceAgencies } from '../services/claimMdWorkspace.service.js';
import { clientCoverageAdmission } from '../services/clientCoverageAdmission.service.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';

export async function getInsuranceVerificationWorkspace(req,res,next){try{
 const organizations=await billingWorkspaceAgencies(req.user);
 const agencyId=Number(req.query.agencyId)||0;
 const agencies=organizations.filter(a=>!agencyId||Number(a.id)===agencyId);
 if(agencyId&&!agencies.length)return res.status(403).json({error:{message:'Billing access required for this organization'}});
 if(!agencies.length)return res.json({items:[],organizations,total:0,page:1});
 const page=Math.max(1,Number.parseInt(req.query.page,10)||1),limit=40,search=String(req.query.search||'').trim().slice(0,100),ids=agencies.map(a=>a.id);
 const filter=`c.agency_id IN (${ids.map(()=>'?').join(',')}) AND c.client_type IN ('school','clinical','mental_health') AND c.compliance_archived_at IS NULL AND c.status NOT IN ('ARCHIVED','DECLINED','INACTIVE','TERMINATED')`;
 const clientId=Number(req.query.clientId)||0;
 const searchSql=(clientId?' AND c.id=?':'')+(search?' AND (c.full_name LIKE ? OR c.initials LIKE ? OR CAST(c.id AS CHAR)=?)':'');
 const args=[...ids,...(clientId?[clientId]:[]),...(search?[`%${search}%`,`%${search}%`,search]:[])];
 const [[count]]=await pool.execute(`SELECT COUNT(*) AS total FROM clients c WHERE ${filter}${searchSql}`,args);
 const [rows]=await pool.execute(`SELECT c.id,c.agency_id,c.client_type,c.full_name,c.initials,c.primary_insurer_name,a.name AS agency_name,
  (SELECT t.id FROM tasks t WHERE t.assigned_to_agency_id=c.agency_id AND t.source_ref_type='insurance_verification' AND BINARY t.source_ref_id=BINARY CAST(c.id AS CHAR) ORDER BY t.id DESC LIMIT 1) AS task_id
  FROM clients c JOIN agencies a ON a.id=c.agency_id WHERE ${filter}${searchSql} ORDER BY c.created_at DESC,c.id DESC LIMIT ${limit} OFFSET ${(page-1)*limit}`,args);
 const items=[];
 for(const client of rows){const status=await clientCoverageAdmission(client.id,{client}),insurance=await readClientInsurance(client.id,client.agency_id);items.push({clientId:client.id,agencyId:client.agency_id,organizationName:client.agency_name,clientName:client.full_name||client.initials||`Client #${client.id}`,primary:insurance?.primary?.insurerName||client.primary_insurer_name||'Not recorded',secondary:insurance?.secondary?.insurerName||null,taskId:client.task_id,...status});}
 res.set('Cache-Control','no-store').json({items,organizations,total:Number(count.total),page,pageSize:limit});
}catch(e){next(e);}}
