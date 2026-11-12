const text=value=>typeof value==='string' ? value.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').trim() : '';
const written=value=>!!text(value) && !/^Write this section[.…]?$/i.test(text(value));

// New clinical drafts may consist solely of entered assessment fields. Metadata,
// an untouched template and diagnoses loaded from an existing chart are not new
// authorship and must not create a draft just by opening a workspace.
export function hasAuthoredStructuredChart(chart) {
  if(!chart||typeof chart!=='object')return false;
  const meds=chart.medications||{},mse=chart.mentalStatusExam||{},risk=chart.riskAssessment||{};
  if(meds.noneCurrently===true || written(meds.commentsHtml))return true;
  if((meds.items||[]).some(item=>typeof item==='string'?written(item):['name','medication','dosage','dose','frequency','prescriber','notes'].some(key=>written(item?.[key]))))return true;
  if(mse.allNormal===true||mse.allNotAssessed===true||Object.values(mse.domains||{}).some(d=>['status','option','detail'].some(key=>written(d?.[key]))))return true;
  return risk.patientDeniesAll===true||Object.keys(risk.items||{}).length>0||(risk.areas||[]).length>0||(risk.protectiveFactors||[]).length>0||written(risk.notes);
}
export function hasAuthoredDraftPayload(payload) {
  if(written(payload?.inputText)||Object.values(payload?.outputJson?.sections||{}).some(written))return true;
  const chart=payload?.outputJson?.meta?.structuredChart;
  if(Number(payload?.clientId)>0&&Number(chart?.clientId)>0&&Number(payload.clientId)!==Number(chart.clientId))return false;
  return hasAuthoredStructuredChart(chart);
}
