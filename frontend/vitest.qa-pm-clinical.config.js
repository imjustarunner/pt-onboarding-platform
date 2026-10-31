import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:[
  'src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js',
  'src/components/school/__tests__/SchoolContactPlanSplash.test.js',
  'src/views/admin/__tests__/SchoolContactPlansView.test.js',
  'src/composables/__tests__/useAppointmentChange.test.js',
  'src/composables/__tests__/AppointmentChangeWizard.test.js'
]}});
