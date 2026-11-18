import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: [
    'src/components/schedule/__tests__/virtualSessionBooking.test.js',
    'src/components/schedule/__tests__/officeSessionBookingFlow.test.js',
    'src/components/schedule/__tests__/scheduleLoading.test.js',
    'src/components/schedule/__tests__/AppointmentEditorShell.test.js'
  ] } });
