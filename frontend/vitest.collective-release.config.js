import {defineConfig} from 'vitest/config';
import catalog from './vitest.catalog-documents.config.js';
import contracts from './vitest.contract-policy-feedback.config.js';
import roles from './vitest.contract-roles.config.js';
export default defineConfig({...catalog,root:new URL('.',import.meta.url).pathname,test:{...catalog.test,include:[...new Set([
  ...catalog.test.include,...contracts.test.include,...roles.test.include,
  'src/components/schedule/__tests__/SchoolSupportCancellationBenefit.test.js',
  'src/components/payroll/__tests__/SchoolSupportSubmit.test.js',
  'src/composables/__tests__/useAppointmentChange.test.js',
  'src/utils/__tests__/noteAidBillingAddons.test.js'
])]}});
