import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',maxWorkers:1,include:['src/utils/__tests__/supportReplyEdits.test.js','src/components/tickets/__tests__/TicketDeskView.test.js','src/views/admin/__tests__/SupportReplyFeedbackView.test.js']}});
