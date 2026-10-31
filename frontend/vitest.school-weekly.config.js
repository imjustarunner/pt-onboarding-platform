import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:[
  'src/components/school/redesign/__tests__/SchoolWeeklyBooking.test.js',
  'src/components/school/redesign/__tests__/SoftScheduleEditor.test.js',
  'src/components/school/redesign/__tests__/ProviderPanel.test.js'
]}});
