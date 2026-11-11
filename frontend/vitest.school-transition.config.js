import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/school/redesign/__tests__/SchoolBookedSessions.test.js','src/components/school/redesign/__tests__/SoftScheduleEditor.test.js','src/components/school/redesign/__tests__/SchoolWeeklyBooking.test.js']}});
