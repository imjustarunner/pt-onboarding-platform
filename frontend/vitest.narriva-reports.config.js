import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({test:{projects:[
  {test:{name:'reports-server',environment:'node',include:['../backend/src/services/__tests__/narrivaAuditStandards.test.js','../backend/src/services/__tests__/narrivaComplianceReport*.test.js','../backend/src/services/__tests__/clinicalNoteReviewInsights*.test.js'],fileParallelism:false,testTimeout:20000}},
  {plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{name:'reports-ui',environment:'jsdom',include:['src/views/admin/__tests__/NarrivaComplianceReports.test.js','src/components/clinical/__tests__/NoteReviewActions*.test.js','src/components/clinical/__tests__/NarrivaTreatmentHistory*.test.js']}}
]}});
