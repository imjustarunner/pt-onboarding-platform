import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins:[vue()], test:{ environment:'jsdom', maxWorkers:1,
 include:['src/components/unifiedInbox/__tests__/*.test.js','src/components/tickets/__tests__/TicketDeskView.test.js','src/components/messages/__tests__/EmailThreadReader.test.js','src/components/messages/__tests__/ConversationEmailBody.test.js','src/utils/__tests__/emailPresentation.test.js','src/utils/__tests__/emailConversationText.test.js'] } });
