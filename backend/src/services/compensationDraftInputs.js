import {conditionalLevelBonus,defaultHcodeIndirectMinutes} from '../utils/serviceCreditPolicy.js';
/** Fill missing draft inputs from saved records only. Never infer a level from a credential or rate. */
export function fillSavedCompensationInputs(existing,{assignment,rates=[],levels=[],ptoRate,agreementDate}={}) {
 const data=structuredClone(existing);const s=data.schedule ||= {};data.employee ||= {};
 if(s.category==null && s.level==null && assignment){s.category=Number(assignment.category);s.level=Number(assignment.level);}
 const rate=rates.find(r=>Number(r.category)===Number(s.category)&&Number(r.level)===Number(s.level));
 const mapping={creditRate:'credit_rate',hcodeRate:'hcode_rate',indirectRate:'indirect_rate',supportRate:'support_activity_rate',creditRateProbation:'credit_rate_probation',hcodeRateProbation:'hcode_rate_probation',indirectRateProbation:'indirect_rate',supportRateProbation:'support_activity_rate'};
 for(const [key,column] of Object.entries(mapping))if(s[key]==null&&Number(rate?.[column])>0)s[key]=Number(rate[column]);
 if(s.ptoRate==null&&Number(ptoRate)>0)s.ptoRate=Number(ptoRate);
 if(!s.levelDescription)s.levelDescription=levels.find(l=>Number(l.category)===Number(s.category)&&Number(l.level)===Number(s.level))?.label||'';
 if(!data.employee.originalAgreementDate&&agreementDate)data.employee.originalAgreementDate=String(agreementDate).slice(0,10);
 if(assignment){s.spanishDifferentialEligible=!!Number(assignment.spanish_bonus_eligible);s.denverDifferentialEligible=!!Number(assignment.location_bonus_eligible);}
 const json=v=>typeof v==='string'?JSON.parse(v):v;
 if(rate){s.spanishDifferentialRates=json(rate.spanish_bonus_json)||{};s.denverDifferentialRates=json(rate.location_bonus_json)||{};}
 s.autoIndirectMinutes=[1,2,3].includes(Number(s.category))?defaultHcodeIndirectMinutes(s.category):null;
 s.tier3LevelBonus=conditionalLevelBonus(s.level);
 return data;
}
