import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/__tests__/AccountSecurityNotice.holds.test.js','src/components/admin/clientChart/__tests__/ClientIntakeNotePanel.review.test.js'],restoreMocks:true}});
