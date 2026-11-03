import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: [
    'src/components/schedule/__tests__/scheduleDayLayout.test.js',
    'src/components/schedule/__tests__/scheduleBlocks.test.js',
    'src/components/schedule/__tests__/scheduleOverlap.test.js',
    'src/components/schedule/__tests__/SchoolAbsenceRecords.test.js',
    'src/components/schedule/__tests__/schoolSoftCalendar.test.js',
    'src/utils/__tests__/schoolSoftScheduleBlocks.test.js'
  ] }
});
