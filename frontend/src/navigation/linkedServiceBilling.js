// October 2026 Colorado SBHS manual, pp. 18–20 and 30–39.
// Use documented eligible minutes for this service component; never combine
// administration, evaluation, or unrelated encounters here.
export const LINKED_SERVICE_FAMILIES = Object.freeze([
  { parent: '90839', addon: '90840', firstMinimum: 31, addonStart: 75, increment: 30 },
  { parent: '96116', addon: '96121', firstMinimum: 31, addonStart: 91, increment: 60 },
  { parent: '96130', addon: '96131', firstMinimum: 31, addonStart: 91, increment: 60 },
  { parent: '96132', addon: '96133', firstMinimum: 31, addonStart: 91, increment: 60 },
  { parent: '96136', addon: '96137', firstMinimum: 16, addonStart: 46, increment: 30 },
  { parent: '96138', addon: '96139', firstMinimum: 16, addonStart: 46, increment: 30 }
]);
export function linkedServiceRelationship(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const family = LINKED_SERVICE_FAMILIES.find(f => f.parent === normalized || f.addon === normalized);
  return family ? { ...family, isAddon: family.addon === normalized } : null;
}
function modifiersFor(line){
  let value=line?.modifiers_json ?? line?.modifiers ?? [];
  if(typeof value==='string')try{value=JSON.parse(value);}catch{value=value.split(/[,\s]+/);}
  return (Array.isArray(value)?value:[]).map(value=>String(value).toUpperCase());
}
export function resolveLinkedServiceBilling(code, durationMinutes, context={}) {
  const relationship = linkedServiceRelationship(code);
  if (!relationship) return null;
  // Manual p. 19: ET mobile crisis has a separate H2011 ET protocol.
  if(relationship.parent==='90839' && modifiersFor(context).includes('ET'))return null;
  if (relationship.isAddon) return { claimable: false, units: 0, addons: [], reason: `${relationship.addon} is calculated from ${relationship.parent}; select the parent service and document its eligible minutes.` };
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes < relationship.firstMinimum) return { claimable: false, units: 0, addons: [], reason: `${relationship.parent} requires at least ${relationship.firstMinimum} documented eligible minutes.` };
  const units = minutes < relationship.addonStart ? 0 : 1 + Math.floor((minutes - relationship.addonStart) / relationship.increment);
  return { claimable: true, reason: null, units: 1, addons: units ? [{ code: relationship.addon, units }] : [] };
}
export function linkedServiceLineBlockers(lines, durationMinutes, primaryCode) {
  const blockers = [];
  const codeOf = line => String(line.procedure_code || line.procedureCode || line.code || '').toUpperCase();
  const codes = lines.map(codeOf);
  const mobileCrisis=lines.some(line=>codeOf(line)==='90839' && modifiersFor(line).includes('ET'));
  if(mobileCrisis && codes.includes('90840'))blockers.push('90839 with ET uses the mobile crisis protocol; 90840 must not be added using the outpatient timing rule.');
  if(LINKED_SERVICE_FAMILIES.filter(family=>codes.includes(family.parent)).length>1)blockers.push('Document and bill each timed testing or crisis component separately so its eligible minutes are not counted twice.');
  for (const family of LINKED_SERVICE_FAMILIES) {
    if (codes.includes(family.addon) && !codes.includes(family.parent)) blockers.push(`${family.addon} requires its parent service ${family.parent} on this claim.`);
  }
  const relationship = linkedServiceRelationship(primaryCode);
  if (!relationship || relationship.isAddon) return blockers;
  if(relationship.parent==='90839' && mobileCrisis)return blockers;
  const expected = resolveLinkedServiceBilling(primaryCode, durationMinutes);
  if (!expected.claimable) return [...blockers, expected.reason];
  for (const code of [relationship.parent, relationship.addon]) {
    const matching = lines.filter(line => codeOf(line) === code);
    const expectedUnits = code === relationship.parent ? 1 : (expected.addons[0]?.units || 0);
    if (matching.length !== (expectedUnits ? 1 : 0) || matching.reduce((sum, line) => sum + Number(line.units), 0) !== expectedUnits) blockers.push(`${code}: the documented ${durationMinutes} eligible minutes require ${expectedUnits} unit(s). Reconcile the linked service lines before submission.`);
  }
  return blockers;
}
