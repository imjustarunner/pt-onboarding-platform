import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins:[vue()], test:{environment:'jsdom',restoreMocks:true,include:[
  'src/utils/__tests__/contractHandbookReferences.test.js',
  'src/components/documents/__tests__/ContractHandbookModal.test.js',
  'src/components/documents/__tests__/DocumentSigningWorkflow.test.js',
  'src/components/handbook/__tests__/WorkplaceHandbookReader.test.js',
  'src/components/handbook/__tests__/WorkplaceHandbookHistory.test.js',
  'src/views/__tests__/CandidatePreHirePortal.account.test.js',
  'src/views/__tests__/WorkplaceHandbookView.reference.test.js',
  'src/views/admin/__tests__/MedicalServiceInventory.test.js',
  'src/views/admin/__tests__/MedicalBillingManagedAccess.test.js'
]}});
