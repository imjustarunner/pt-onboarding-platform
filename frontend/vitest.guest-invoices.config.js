import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/views/__tests__/GuestInvoicePaymentView.test.js','src/views/__tests__/GuestInvoiceIsolation.test.js','src/components/billing/__tests__/GuestInvoiceShare.test.js']}});
