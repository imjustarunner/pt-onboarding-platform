import pool from '../config/database.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
import {utcDateToZonedYmd} from '../utils/zonedWallTime.util.js';
import {normalizeLearningProfile} from './learningCatalog.js';
export function attendanceFeeRuleMatches(rule,context={}) {
  for(const key of ['businessType','serviceCode','payerType','providerCategory','providerLevel','customerTierId','modality']) {
    if(key==='payerType'&&rule.payerType==='insurance'&&['insurance','medicaid','medicare','commercial'].includes(context.payerType))continue;
    if(rule[key]!=null&&rule[key]!==''&&String(rule[key]).toLowerCase()!==String(context[key]??'').toLowerCase())return false;
  }
  return true;
}
export function attendanceFeeSpecificity(rule) {
  return ['businessType','serviceCode','payerType','providerCategory','providerLevel','customerTierId','modality'].filter(key=>rule[key]!=null&&rule[key]!=='').length+(rule.payerType&&rule.payerType!=='insurance'?0.25:0);
}
export async function attendanceFundingType({payerType,clientId,businessType}) {
  if(payerType==='self_pay'||businessType==='tutoring'||businessType==='learning')return 'self_pay';
  if(!clientId)return payerType;
  const {readClientInsurance}=await import('./clientInsurance.service.js');
  const {hasMedicaidCoverage}=await import('../utils/insurancePaymentPolicy.js');
  const insurance=await readClientInsurance(Number(clientId));
  if(hasMedicaidCoverage(insurance))return 'medicaid';
  if(/medicare/i.test(String(insurance?.primary?.insurerName||'')))return 'medicare';
  return insurance?.primary?.insurerName?'commercial':payerType;
}
export async function providerAttendanceFeeContext({agencyId,providerUserId,startAt=null,timeZone='America/Denver'},db=pool) {
  if(!Number(providerUserId))return {};
  const [profiles]=await db.execute('SELECT learning_settings_json FROM provider_tutoring_profiles WHERE agency_id=? AND user_id=?',[Number(agencyId),Number(providerUserId)]);
  const raw=profiles[0]?.learning_settings_json;
  const learning=normalizeLearningProfile(typeof raw==='string'?JSON.parse(raw):raw||{});
  const {effectiveCompensationAgreement,agreementRateProfile}=await import('./employmentAgreementPolicy.service.js');
  const asOfDate=utcDateToZonedYmd(startAt?parseUtcDate(startAt):new Date(),timeZone);
  const agreement=await effectiveCompensationAgreement({agencyId:Number(agencyId),userId:Number(providerUserId),asOfDate,db});
  const placement=agreement?agreementRateProfile({},agreement):{};
  // Category/level are selectors, never employee wage amounts. The quoted
  // customer price comes separately from the customer-rate resolver.
  return {providerCategory:placement.category||null,providerLevel:placement.level||null,customerTierId:learning.tierId||null};
}
