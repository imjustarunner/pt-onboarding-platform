import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.',import.meta.url).pathname, plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}}, test:{environment:'jsdom',include:['src/components/schedule/__tests__/dayCancellationDialog.test.js','src/utils/__tests__/dayCancellationLink.test.js','src/components/events/__tests__/EventTravelReportModal.test.js']} });
