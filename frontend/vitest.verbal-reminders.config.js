import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import regression from './vitest.clinical-audit-regression.config.js';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:regression.resolve,test:{environment:'jsdom',include:[...regression.test.include,'src/components/admin/__tests__/ClientReminderTextConsent.test.js'],restoreMocks:true}});
