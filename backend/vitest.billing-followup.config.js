export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/insuranceCards.reminders.test.js','src/services/__tests__/claimMdWorkspace.test.js','src/services/__tests__/managedBillingScope.test.js','src/services/__tests__/scheduling.billingAccess.test.js','src/services/__tests__/guardianAccess.balanceNotifications.test.js','src/services/__tests__/billingSenderMembers.test.js','src/services/__tests__/billingSenderProvisioning.test.js','src/services/__tests__/collectionOrganizations.test.js'],restoreMocks:true}
};
