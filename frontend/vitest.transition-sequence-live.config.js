import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/views/teamMeeting/__tests__/personalInvitation.test.js','src/components/meetings/__tests__/ScheduledTrainingPanel.test.js']}});
