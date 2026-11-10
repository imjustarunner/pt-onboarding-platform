import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({test:{projects:[
 {test:{name:'tester-server',environment:'node',include:['../backend/src/controllers/__tests__/narrivaTestReview.controller.test.js','../backend/src/services/__tests__/narrivaTestReview.test.js','../backend/src/services/__tests__/narrivaReview.integration.test.js','../backend/src/services/__tests__/narrivaScoring.test.js']}},
 {plugins:[vue()],test:{name:'tester-ui',environment:'jsdom',include:['src/components/clinical/__tests__/NarrivaComplianceTester.test.js','src/components/clinical/__tests__/ClinicalNoteNarriva.test.js','src/views/admin/__tests__/NarrivaComplianceReports.test.js','src/auricwell/__tests__/Compliance.test.js']}}
]}});
