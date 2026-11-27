import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
export default {root:fileURLToPath(new URL('.',import.meta.url)),plugins:[vue()],test:{environment:'jsdom',pool:'threads',maxWorkers:1,include:['src/components/communications/__tests__/HiringNotificationChoices.test.js','src/components/hiring/__tests__/InterviewSmsConsent.test.js']}};
