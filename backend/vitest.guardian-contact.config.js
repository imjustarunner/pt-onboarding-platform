import { defineConfig } from '../frontend/node_modules/vitest/dist/config.js';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/routes/__tests__/guardianContactMethods.test.js',
    'src/services/__tests__/guardianContactContext.account.test.js',
    'src/services/__tests__/linkedGuardianContact.test.js',
    'src/services/__tests__/guardianWorkspace.test.js',
    'src/services/__tests__/guardianFinancialWorkspace.test.js',
    'src/services/__tests__/guardianStatements.test.js',
    'src/services/__tests__/staffVerbalReminderConsent.test.js',
    'src/controllers/__tests__/guardianAccountWorkspace.test.js',
    'src/controllers/__tests__/clientGuardianPortalModes.test.js',
    'src/controllers/__tests__/clientGuardianContactSave.test.js',
    'src/controllers/__tests__/guardianRelationshipRestore.test.js',
    'src/models/__tests__/schoolGuardianPolicy.concurrentAccess.test.js'
  ] }
});
