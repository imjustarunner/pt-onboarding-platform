// Reviewed program-rate terminology changes; quiz answers still test actual
// attendance and service eligibility. Future content changes must be reviewed.
const reviewed = {
  'facilitator-coding-protocol': {slug:'company-service-boundaries',oldHash:'9e27b982edc047612b2aa4487e9991a8a070c1cdb557208aaf70b68a2b6a47a8',newHash:'3502011b837edafadfdf3252842c0ee2a03dbe2f78a70f2c001f838ae618519e'},
  'skill-development-guide': {slug:'program-boundaries',oldHash:'21e13de2ca41f81c40e357f9675750759b47a7921d8bd98cc97281405b54ec05',newHash:'7bdf7e60ecfd5ae4219410d724d41cba7a55dea3a75597cbbec470aaf020c185'}
};
export function applyProgramRateTrainingAmendment(definition) {
  const change = reviewed[definition.documentKey];
  if (!change || !definition.tenants?.includes('nlu') || definition.sectionHashes?.[change.slug] !== change.oldHash) return definition;
  const {previousEditions = [],...previous} = definition;
  return {...definition,sectionHashes:{...definition.sectionHashes,[change.slug]:change.newHash},previousEditions:[previous,...previousEditions]};
}
