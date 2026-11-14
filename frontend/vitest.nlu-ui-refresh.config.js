import base from './vitest.nlu-retest.config.js';
export default {...base,test:{...base.test,include:[...new Set([...base.test.include,
 'src/components/schedule/__tests__/AppointmentLearningWorkspace.test.js',
 'src/components/schedule/__tests__/AppointmentStaffTools.test.js',
 'src/components/guardian/__tests__/GuardianFamilyBilling.test.js',
 'src/components/admin/__tests__/FrequentPagesBar.test.js',
 'src/views/__tests__/LibraryView.test.js',
 'src/utils/__tests__/virtualAvailabilityGrid.test.js'
])]}};
