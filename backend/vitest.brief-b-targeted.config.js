export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
  'src/services/__tests__/paperPacketProcessing.test.js',
  'src/controllers/__tests__/paperPacketAccess.test.js',
  'src/services/__tests__/treatmentPlanCalendarDate.test.js',
  'src/services/__tests__/familyPortalEmail.content.test.js',
  'src/services/__tests__/bookedSessionWork.test.js',
  'src/services/__tests__/clinicalDraftAppointmentRepair.test.js',
  'src/services/__tests__/schoolIntakeCommunications.test.js',
  'src/services/__tests__/clientPortalInvites.test.js',
  'src/controllers/__tests__/clientGuardianContact.test.js'
 ],restoreMocks:true}
};
