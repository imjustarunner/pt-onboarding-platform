export const paperDemographicKeys = ['firstName','lastName','dateOfBirth','gender','grade','preferred_language','address_street','address_city','address_state','address_zip'];

// Old flattened OCR could put a birth date in Street or several table rows in
// City. Keep those values out of proposals, including previously saved reads.
export function validPaperDemographic(key, value) {
  const text=String(value ?? '').trim();
  if(!text)return '';
  if(key==='address_city' && (/^\d{3,}\b|\b(?:male|female|masculino|femenino|custodian|dependent|parent|custodio)\b/i.test(text)||text.length>80))return '';
  if(key==='address_street' && (/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(text)||/parent or custodian|legal right/i.test(text)))return '';
  if(key==='gender')return ['Male','Female','Other','Prefer not to say'].find(option=>option.toLowerCase()===text.toLowerCase())||'';
  return text;
}

// A baseline records the fields proposed before staff edits. A reread may
// replace those values and fill blanks; it must preserve subsequent staff edits.
export function mergePaperDemographics(current, proposed, baseline, {initial=false,readStartedWith=null}={}) {
  const result={...current};
  for(const key of paperDemographicKeys){
    if(!initial&&readStartedWith&&current[key]!==readStartedWith[key])continue;
    const value=validPaperDemographic(key,proposed?.[key]);
    if(initial)result[key]=validPaperDemographic(key,result[key]);
    if(value && (initial || !String(result[key]??'').trim() || (baseline && Object.hasOwn(baseline,key) && result[key]===baseline[key])))result[key]=value;
  }
  return result;
}
