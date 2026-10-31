import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
 'src/utils/__tests__/scheduleLocationProjection.test.js',
 'src/components/schedule/__tests__/scheduleLoading.test.js',
 'src/components/schedule/__tests__/scheduleQuarterHourFlow.test.js',
 'src/components/provider/__tests__/ProviderUpdateOfficeSchedule.test.js',
 'src/components/provider/__tests__/ProviderHoursFocus.test.js',
 'src/components/schedule/__tests__/OfficeEventSessionNotePanel.test.js',
 'src/components/clinical/__tests__/NoteAidTreatmentPlanStandaloneModal.test.js'
]}});
