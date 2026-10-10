export const MARIELA_TRAVEL_STIPEND = 'Continuation of existing travel stipend: Mariela Duran’s previously agreed travel stipend will continue under the existing written arrangement, including its agreed amount, payment schedule and eligibility terms. This individual stipend arrangement is preserved and is not replaced or reduced by this amendment’s standard compensation terms or general mileage policy. Any later change must be agreed in writing and apply prospectively; amounts already earned remain payable.';
export function correctIndividualAmendment(data,userId) {
 const updated=structuredClone(data);
 if([482,485].includes(Number(userId))){updated.schedule ||= {};updated.schedule.spanishDifferentialEligible=Number(userId)===485;}
 if(Number(userId)===494&&!String(updated.additionalTerms||'').includes(MARIELA_TRAVEL_STIPEND))updated.additionalTerms=[updated.additionalTerms,MARIELA_TRAVEL_STIPEND].filter(Boolean).join('\n\n');
 return updated;
}
// Only clinically proficient languages belong in matching and session-language fields.
export function correctSpanishLanguages(value,eligible) {
 const values=(Array.isArray(value)?value:[value]).flatMap(item=>String(item||'').split(/\s*(?:,|;|\/|&|\band\b)\s*/i)).map(item=>item.trim());
 const other=values.filter(item=>!/\bspanish\b|español|spanglish/i.test(String(item)));
 return [...new Set([...other.filter(Boolean),...(eligible?['Spanish']:[])])];
}
export function correctSpanishProfile(details,eligible) {
 const result=structuredClone(details||{});
 result.languages=correctSpanishLanguages(result.languages,eligible);
 if(Array.isArray(result.languageProficiencies)){
  result.languageProficiencies=result.languageProficiencies.filter(row=>!/\bspanish\b|español|spanglish/i.test(String(row.language)));
  if(eligible)result.languageProficiencies.push({language:'Spanish',proficiency:'professional',canConductSessions:true});
 }
 return result;
}
