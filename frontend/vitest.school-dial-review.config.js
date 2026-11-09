import { defineConfig } from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/utils/__tests__/schoolSoftScheduleBlocks.test.js','src/components/schedule/__tests__/MeetingSettingsEditor.test.js','src/components/meetings/__tests__/MeetingDialInPanel.test.js']}});
