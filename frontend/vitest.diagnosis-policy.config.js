import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/components/clinical/__tests__/ClinicalAppointmentAlertGate.test.js','src/components/clinical/__tests__/ClinicalDiagnosisReviewPanel.test.js','src/utils/__tests__/noteAidIntakeIntegration.test.js']}});
