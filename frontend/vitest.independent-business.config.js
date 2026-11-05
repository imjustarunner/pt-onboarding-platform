import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/views/admin/__tests__/IndependentBusinessAccountView.test.js','src/utils/__tests__/independentBusinessAccess.test.js','src/components/admin/__tests__/BillingManagementAgreementReview.test.js','src/utils/__tests__/invoiceAgreementDisplay.test.js']}});
