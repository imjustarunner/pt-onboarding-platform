import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: { environment:'jsdom', include:[
'src/components/clients/__tests__/SchoolPaperPacketWorkflow.test.js',
'src/components/clients/__tests__/PaperChecklistRoiReview.test.js',
'src/components/admin/__tests__/OfficeIntakeQueuePanel*.test.js',
'src/views/admin/__tests__/OfficeClients*.test.js',
'src/utils/__tests__/enrollmentPresentation.test.js',
'src/components/client/__tests__/ClientAffiliatedContactsPanel.test.js',
'src/components/admin/__tests__/ClientNameDuplicatesPanel*.test.js'
], restoreMocks:true } });
