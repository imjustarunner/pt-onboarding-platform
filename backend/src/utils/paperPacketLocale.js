export const foldPaperText = value => String(value || '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();

export function paperPacketLocale(text, requested = 'auto') {
  if (['en','es'].includes(requested)) return requested;
  const source=foldPaperText(text);
  const cues=[/nombre\s+(?:completo\s+)?del\s+(?:dependiente|menor|estudiante)/,/fecha\s+de\s+nacimiento/,/seguro\s+(?:primario|secundario)/,/titular\s+(?:de\s+la\s+poliza|secundario)/,/su\s+correo\s+electronico/,/firme\s+aqui/,/historial\s+de\s+(?:abuso|negligencia)/];
  return cues.filter(cue=>cue.test(source)).length>=2?'es':'en';
}

export function englishPaperValue(key, value) {
  const text=String(value || '').trim(),fold=foldPaperText(text);
  if(key==='administrativeSex')return ({masculino:'Male',hombre:'Male',varon:'Male',nino:'Male',femenino:'Female',mujer:'Female',nina:'Female',otro:'Other',otra:'Other','prefiero no decir':'Prefer not to say','prefiere no decir':'Prefer not to say'})[fold] || text;
  if(['preferredLanguage','guardianPreferredLanguage'].includes(key))return ({espanol:'Spanish',ingles:'English','lenguaje de senas':'Sign language','lengua de senas':'Sign language'})[fold] || text;
  if(key==='guardianRelationship')return ({madre:'Mother',padre:'Father',tutor:'Guardian',tutora:'Guardian',abuela:'Grandmother',abuelo:'Grandfather',otro:'Other',otra:'Other'})[fold] || text;
  if(key==='grade'){
    const grades=['primero','segundo','tercero','cuarto','quinto','sexto','septimo','octavo','noveno','decimo','undecimo','duodecimo'];
    const index=grades.findIndex(grade=>new RegExp(`^${grade}(?:\\s+grado)?$`).test(fold));
    if(index>=0)return String(index+1);
    if(/^(?:pre[- ]?kinder|preescolar)$/.test(fold))return 'Pre-K';
    if(/^(?:kinder|jardin de ninos)$/.test(fold))return 'Kindergarten';
  }
  return text;
}

// Extract answers only. Printed legal language and instrument scores are never
// translated into consent, authority, diagnoses, or inferred questionnaire marks.
export function paperWrittenResponses(rawText, locale) {
  const source=String(rawText || '').replace(/Por\s+favor\s+enumere\s+cualquier\s+información\s+médica\s+necesaria,\s+incluyendo\s+alergias\s+alimentarias\./giu,'Por favor enumere cualquier información médica necesaria, incluyendo alergias alimentarias.');
  const lines=source.split(/\r?\n/),result=[];
  const definitions=[
    {key:'historyExplanation',label:'History explanation',start:/^(?:por favor explique|please explain)\b/},
    {key:'medicalInformation',label:'Medical information and food allergies',start:/^(?:por favor (?:enumere|indique).*informacion medica|please list any necessary medical information)\b/}
  ];
  const stop=/^(?:por favor (?:enumere|indique|seleccione)|please (?:list|select)|historial de|history of|autorizacion|consent|firme aqui|sign here|reconocimiento|acknowledg|resumen de|page \d|pagina \d)/;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].trim(),definition=definitions.find(field=>field.start.test(foldPaperText(line)));
    if(!definition)continue;
    const colon=line.indexOf(':');const answers=colon>=0?[line.slice(colon+1).trim()]:[];
    let j=i+1;
    while(j<lines.length && !stop.test(foldPaperText(lines[j].trim()))){answers.push(lines[j].trim());j++;}
    const sourceText=answers.filter(answer=>answer&&!/^[_\s.\-]+$/.test(answer)).join('\n').trim().slice(0,8000);
    if(sourceText)result.push({key:definition.key,label:definition.label,sourceText,sourceLocale:locale,englishText:locale==='en'?sourceText:'',status:locale==='en'?'original':'pending'});
    i=j-1;
  }
  return result;
}
