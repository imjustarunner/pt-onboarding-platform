import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: [
    'src/components/schedule/__tests__/appointmentReschedule.test.js',
    'src/composables/__tests__/useAppointmentChange.test.js',
    'src/composables/__tests__/AppointmentChangeWizard.test.js',
    'src/components/schedule/__tests__/meetingDateReschedule.test.js'
  ] }
});
