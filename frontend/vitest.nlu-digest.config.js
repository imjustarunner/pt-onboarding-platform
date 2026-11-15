import {defineConfig}from'vitest/config';import vue from'@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
'src/composables/__tests__/portalCareApi.test.js',
'src/components/schedule/__tests__/RecurrenceControls.test.js',
'src/components/guardian/__tests__/GuardianBookingPackage.test.js',
'src/components/guardian/__tests__/FamilyPortalNavigation.test.js',
'src/components/guardian/__tests__/GuardianPendingEnrollment.test.js',
'src/components/guardian/__tests__/GuardianCancellationDialog.test.js',
'src/components/billing/__tests__/FamilyLedgerPanel.test.js',
'src/views/__tests__/ChildcareShiftsView.test.js',
'src/utils/__tests__/childcarePresentation.test.js'
]}});
