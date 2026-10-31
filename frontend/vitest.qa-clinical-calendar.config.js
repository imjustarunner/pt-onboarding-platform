import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } }, test: { environment: 'jsdom', include: [
  'src/components/schedule/__tests__/scheduleLoading.test.js',
  'src/components/schedule/__tests__/scheduleQuarterHourFlow.test.js',
  'src/components/schedule/__tests__/OfficeEventSessionNotePanel.test.js',
  'src/components/schedule/__tests__/AppointmentEditorShell.test.js',
  'src/components/schedule/__tests__/AppointmentClinicalPanel.test.js',
  'src/utils/__tests__/scheduleAppointmentContext.test.js',
  'src/components/school/__tests__/SchoolContactPlanSplash.test.js',
  'src/components/provider/__tests__/ProviderUpdateSchoolSchedule.test.js',
  'src/utils/__tests__/linkedGuardianSummary.test.js'
] } });
