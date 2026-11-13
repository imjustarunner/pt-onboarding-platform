import base from './vitest.nlu-release.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,'src/composables/__tests__/useDashboardNavigation.test.js','src/utils/__tests__/serviceLegalContext.test.js','src/components/guardian/__tests__/GuardianAppointmentsPanel.test.js']}};
