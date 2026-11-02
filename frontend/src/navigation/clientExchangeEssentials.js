export const EXCHANGE_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const EXCHANGE_PERIODS = ['morning','afternoon','evening'];
export const EXCHANGE_CITIES = ['Colorado Springs','Denver','Either location'];
export const specificExchangeInsurance = value => {
  const text=String(value || '').trim();
  return !!text && !['unknown','notprovided','notspecified','other','unlisted','tbd','commercial','commercialother','commercialinsurance','privateinsurance'].includes(text.toLowerCase().replace(/[^a-z0-9]/g,''));
};
export function missingExchangeEssentials({preferences={},presentingProblems=[]}={}) {
  const missing=[],schedule=preferences.schedule || {};
  if(!['in_person','virtual','either'].includes(preferences.modality))missing.push({key:'modality',label:'visit format'});
  if(['in_person','either'].includes(preferences.modality)&&!EXCHANGE_CITIES.includes(preferences.serviceLocation))missing.push({key:'location',label:'in-person city'});
  if(!specificExchangeInsurance(preferences.insurance))missing.push({key:'insurance',label:'insurance plan or self-pay'});
  if(!schedule.days?.length&&!schedule.windows?.length)missing.push({key:'days',label:'available days'});
  if(!schedule.periods?.length&&!schedule.windows?.length)missing.push({key:'times',label:'available times'});
  const concerns=Array.isArray(presentingProblems)?presentingProblems:[presentingProblems];
  if(!concerns.some(value=>String(value || '').trim()))missing.push({key:'concerns',label:'clinical concerns'});
  return missing;
}
export function assertExchangeEssentials(summary) {
  const missing=missingExchangeEssentials(summary);
  if(missing.length)throw Object.assign(new Error(`Complete the required matching information: ${missing.map(item=>item.label).join(', ')}. Therapist gender and diagnoses are optional.`),{status:400,missingFields:missing.map(item=>item.key)});
}
