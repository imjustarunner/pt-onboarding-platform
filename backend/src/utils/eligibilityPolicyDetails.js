// A readable projection of retained payer evidence. Never infer billing routes,
// subscriber identity, payer order, or a patient's final liability from it.
export const eligibilityList=value=>Array.isArray(value)?value:value?[value]:[];
const text=value=>typeof value==='string'||typeof value==='number'?String(value).trim().slice(0,4000):'';
const unique=values=>[...new Set(values.map(text).filter(Boolean))];
const one=values=>{const found=unique(values);return found.length===1?found[0]:'';};
export function eligibilityDate(value) {
 const raw=text(value).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
 return /^\d{4}-\d{2}-\d{2}$/.test(raw)&&Number.isFinite(Date.parse(raw))&&new Date(raw).toISOString().slice(0,10)===raw?raw:'';
}
export const eligibilityMembers=result=>eligibilityList(result?.elig||result?.result?.elig);
const entities=benefit=>[...(benefit?.entity_name||benefit?.entity_code?[benefit]:[]),...eligibilityList(benefit?.entity)];
const orderedPayers=new Set(['PRP','SEP','TTP']);
const payerRoles=new Set(['PR','PRP','SEP','TTP','OC','P4','P5','2B']);
export function otherInsuranceBenefit(benefit,payerId) {
 return String(benefit?.benefit_coverage_code)==='R'||(payerId==='SKCO0'&&String(benefit?.benefit_coverage_code)==='U')
  ||entities(benefit).some(entity=>orderedPayers.has(String(entity?.entity_code)));
}
export function eligibilityPolicyFields(entry,payerId) {
 const planBenefits=eligibilityList(entry?.benefit).filter(b=>String(b.benefit_code)==='30'&&!otherInsuranceBenefit(b,payerId));
 const contacts=planBenefits.flatMap(entities).filter(e=>String(e.entity_code)==='PR');
 const contactFields=['entity_name','entity_phone','entity_addr_1','entity_city','entity_state','entity_zip'];
 const distinctContacts=[...new Map(contacts.map(e=>[JSON.stringify(contactFields.map(k=>text(e[k]))),e])).values()];
 const contact=distinctContacts.length===1?distinctContacts[0]:{};
 return {memberId:text(entry?.ins_number),groupNumber:text(entry?.group_number),groupName:text(entry?.group_name),
  insurerName:text(contact.entity_name),
  planName:text(entry?.plan_name)||one(planBenefits.map(b=>b.insurance_plan)),planNumber:text(entry?.plan_number),
  planType:one(planBenefits.map(b=>b.insurance_type_description)),
  subscriberFirstName:text(entry?.ins_name_f),subscriberLastName:text(entry?.ins_name_l),subscriberDob:eligibilityDate(entry?.ins_dob),subscriberSex:text(entry?.ins_sex),
  subscriberAddressLine1:text(entry?.ins_addr_1),subscriberAddressLine2:text(entry?.ins_addr_2),subscriberCity:text(entry?.ins_city),subscriberState:text(entry?.ins_state),subscriberPostalCode:text(entry?.ins_zip),
  effectiveDate:eligibilityDate(entry?.plan_begin_date)||eligibilityDate(entry?.policy_effective_date),terminationDate:eligibilityDate(entry?.plan_end_date)||eligibilityDate(entry?.policy_expiration_date),
  payerPhone:text(contact.entity_phone),payerAddressLine1:text(contact.entity_addr_1),payerCity:text(contact.entity_city),payerState:text(contact.entity_state),payerPostalCode:text(contact.entity_zip)};
}
export function eligibilityPolicyDetails(result,{payerId}={}) {
 const benefits=[],otherInsurance=[];
 const members=eligibilityMembers(result);
 const policies=members.map((entry,memberIndex)=>({memberIndex,...eligibilityPolicyFields(entry,payerId),
  reportedBeginDate:text(entry.plan_begin_date||entry.policy_effective_date),reportedEndDate:text(entry.plan_end_date||entry.policy_expiration_date)}));
 members.forEach((entry,memberIndex)=>eligibilityList(entry.benefit).forEach((benefit,benefitIndex)=>{
  benefits.push({id:`${memberIndex}:${benefitIndex}`,kind:text(benefit.benefit_coverage_code),kindDescription:text(benefit.benefit_coverage_description),
   serviceCode:text(benefit.benefit_code),serviceDescription:text(benefit.benefit_description),network:text(benefit.inplan_network),
   levelCode:text(benefit.benefit_level_code),levelDescription:text(benefit.benefit_level_description),
   periodCode:text(benefit.benefit_period_code),periodDescription:text(benefit.benefit_period_description),
   amount:text(benefit.benefit_amount),percent:text(benefit.benefit_percent),quantity:text(benefit.benefit_qnty),quantityType:text(benefit.benefit_qnty_type_description||benefit.benefit_qnty_type_code),
   authorizationRequired:text(benefit.authorization_required),beginDate:text(benefit.benefit_begin),endDate:text(benefit.benefit_end),
   planName:text(benefit.insurance_plan),insuranceType:text(benefit.insurance_type_description||benefit.insurance_type_code),notes:text(benefit.benefit_notes)});
  if(!otherInsuranceBenefit(benefit,payerId))return;
  const reported=entities(benefit).filter(e=>!e.entity_code||payerRoles.has(String(e.entity_code)));
  if(!reported.length)reported.push({});
  reported.forEach((entity,entityIndex)=>{
   // entity_id is an entity identifier, not a clearinghouse route or member ID.
   // policy_number is retained as a reported reference until staff reconcile it.
   const policy={insurerName:text(entity.entity_name),payerPhone:text(entity.entity_phone),reportedPolicyNumber:text(benefit.policy_number)};
   otherInsurance.push({id:`${memberIndex}:${benefitIndex}:${entityIndex}`,name:policy.insurerName||'Other insurer not identified',
    role:text(entity.entity_code),reportedEntityId:text(entity.entity_id),reportedPolicyNumber:policy.reportedPolicyNumber,
    beginDate:text(benefit.benefit_begin),endDate:text(benefit.benefit_end),phone:policy.payerPhone,
    address:[entity.entity_addr_1,entity.entity_city,entity.entity_state,entity.entity_zip].map(text).filter(Boolean).join(', '),
    policy,canDraft:!!policy.insurerName&&Object.values(policy).every(value=>value.length<=255)});
  });
 }));
 const distinctOther=[...new Map(otherInsurance.map(item=>[JSON.stringify([item.name,item.role,item.reportedPolicyNumber,item.reportedEntityId,item.phone,item.address,item.beginDate,item.endDate]),item])).values()];
 return {policies,benefits,otherInsurance:distinctOther,otherCoverageReported:otherInsurance.length>0};
}
