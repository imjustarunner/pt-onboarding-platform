import pool from '../config/database.js';
import {executedEmploymentAgreements} from './employmentAgreementPolicy.service.js';
import {readClientInsurance} from './clientInsurance.service.js';
import {hasMedicaidCoverage} from '../utils/insurancePaymentPolicy.js';
import {assertTestingRole,requiresTestingRole,testingServiceDefinition} from '../content/testingServicePolicy.js';

const object=value=>{try{return typeof value==='string'?JSON.parse(value):(value||{});}catch{return {};}};
const date=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
export async function approvedTestingCodeAssignments(agencyId,userId,db=pool) {
  const [rows]=await db.execute(`SELECT ts.service_code FROM staff_service_assignments s
    JOIN tenant_services ts ON ts.id=s.tenant_service_id AND ts.agency_id=s.agency_id
    WHERE s.agency_id=? AND s.user_id=? AND s.is_active=1 AND ts.is_active=1`,[Number(agencyId),Number(userId)]);
  return rows.map(row=>String(row.service_code||'').trim().toUpperCase());
}
/** Never derive Testing permission from a provider title, degree, pay tier or code assignment. */
export async function requireTestingEligibility({agencyId,userId,serviceCodes=[],clientId=null,serviceDate=null,checkCodeAssignments=true},db=pool,deps={}) {
  if(!serviceCodes.some(requiresTestingRole))return null;
  if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1||!Number.isSafeInteger(Number(userId))||Number(userId)<1)throw Object.assign(new Error('Choose the performing provider and practice for Testing.'),{status:403,code:'TESTING_ROLE_REQUIRED'});
  const asOf=date(serviceDate||new Date());
  const agreements=await (deps.agreements||executedEmploymentAgreements)({agencyId:Number(agencyId),userId:Number(userId)},db);
  const eligible=agreements.filter(a=>a.effectiveOn<=asOf).sort((a,b)=>b.effectiveOn.localeCompare(a.effectiveOn)||b.id-a.id);
  // A later role declaration wins, including an explicit removal. A compensation-
  // only amendment with no role declaration does not silently revoke a service.
  const agreement=eligible.find(item=>{
    const data=item.data||{},schedule=object(data.schedule||data.COMPENSATION_SCHEDULE);
    return Object.hasOwn(schedule,'serviceRoles')||Object.hasOwn(data,'CONTRACT_SERVICE_ROLES')||Object.hasOwn(schedule,'testingAuthorized');
  });
  const data=agreement?.data||{},schedule=object(data.schedule||data.COMPENSATION_SCHEDULE);
  const selected=object(schedule.serviceRoles??data.CONTRACT_SERVICE_ROLES??[]);
  const roles=Array.isArray(selected)?selected:[];
  const details=object(data.CONTRACT_SERVICE_ROLE_DETAILS||data.CONTRACT_EXPECTATIONS?.serviceRoleDetails);
  assertTestingRole({...schedule,serviceRoles:roles,testingAuthorized:schedule.testingAuthorized===true||!!details.psychological_testing?.authorizationTerms});
  if(checkCodeAssignments) {
    const codes=await (deps.assignedCodes||approvedTestingCodeAssignments)(Number(agencyId),Number(userId),db);
    const allowed=new Set(codes);
    if(serviceCodes.filter(requiresTestingRole).some(code=>{const definition=testingServiceDefinition(code);return !allowed.has(definition.baseCode||definition.code);}))throw Object.assign(new Error('The performing provider needs an explicit approved assignment to this Testing component/code. An administration assignment does not authorize evaluation or neuropsychological interpretation.'),{status:403,code:'TESTING_COMPONENT_REQUIRED'});
  }
  if(clientId!=null){
    const insurance=await (deps.insurance||readClientInsurance)(Number(clientId),Number(agencyId),db);
    if(!hasMedicaidCoverage(insurance))throw Object.assign(new Error('This Testing policy is limited to Medicaid clients. Verify this client’s coverage and the applicable payer pathway.'),{status:403,code:'TESTING_MEDICAID_REQUIRED'});
  }
  return {agreementId:agreement.id,serviceRole:'psychological_testing',medicaidOnly:true};
}
