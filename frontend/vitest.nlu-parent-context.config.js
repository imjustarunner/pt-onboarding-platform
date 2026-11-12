import base from './vitest.family-refinement.config.js';
// The hosted brand asset is outside the checked-in public tree. These component
// tests exercise portal context and permissions, not remote image delivery.
const hostedMark={name:'hosted-portal-mark',resolveId(id){if(id==='/auricwell/mark.svg')return '\0hosted-portal-mark';},load(id){if(id==='\0hosted-portal-mark')return 'export default "/auricwell/mark.svg";';}};
export default {...base,plugins:[...base.plugins,hostedMark],test:{...base.test,include:[...base.test.include,'src/components/portal/__tests__/FamilyPortalShell.test.js','src/components/guardian/__tests__/GuardianLearningInvitations.test.js','src/views/__tests__/CoGuardianLearningInvite.test.js']}};
