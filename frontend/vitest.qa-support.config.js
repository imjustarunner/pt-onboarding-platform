import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:[
  'src/components/messages/__tests__/QaRecipientEmailInbox.test.js',
  'src/components/messages/__tests__/MessagesHubShell.threading.test.js',
  'src/components/billing/__tests__/ClientAccountSupport.test.js'
]}});
