// Self-report wording: NIMH ASQ English and Spanish editions.
// https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials/asqtranslations/asq-spanish.pdf
// Parent observations retain this application's existing timeframe and perspective;
// they are an adaptation, not the validated patient-administered ASQ.
const selfLabels = {
 en: ['In the past few weeks, have you wished you were dead?', 'In the past few weeks, have you felt that you or your family would be better off if you were dead?', 'In the past week, have you been having thoughts about killing yourself?', 'Have you ever tried to kill yourself?', 'Are you having thoughts of killing yourself right now?'],
 es: ['En las últimas semanas, ¿ha deseado estar muerto?', 'En las últimas semanas, ¿ha sentido que usted o su familia estarían mejor si estuviera muerto?', 'En la última semana, ¿ha estado pensando en suicidarse?', '¿Alguna vez ha intentado suicidarse?', '¿Está pensando en suicidarse en este momento?']
};
const parentLabelsEs = ['En las últimas semanas, ¿su hijo/a ha deseado estar muerto/a?', 'En las últimas semanas, ¿su hijo/a ha sentido que él/ella o su familia estarían mejor si estuviera muerto/a?', 'En las últimas semanas, ¿su hijo/a ha estado pensando en suicidarse?', '¿Su hijo/a ha intentado suicidarse alguna vez?', '¿Su hijo/a está pensando en suicidarse en este momento?'];
export function asqFieldCopy(field, {locale='en',self=!/your child/i.test(field?.label || '')}={}) {
 if (field?.instrument !== 'asq') return null;
 const index=Number(String(field.key || '').match(/(?:^|_)asq_([1-5])$/)?.[1])-1;
 if (!Number.isInteger(index) || index<0) return null;
 const es=locale==='es';
 return {instrument:'asq',label:self?selfLabels[es?'es':'en'][index]:es?parentLabelsEs[index]:field.label,
   helperText:self?(es?'Responda estas preguntas sobre usted.':'Answer these questions about yourself.'):(es?'Preguntas de seguridad — observaciones del padre, madre o cuidador. Responda según lo que ha observado o lo que su hijo/a le ha dicho.':'Safety questions — parent/caregiver observations. Answer based on what you have seen or what your child has told you.'),
   options:[{value:'yes',label:es?'Sí':'Yes'},{value:'no',label:'No'}]};
}
