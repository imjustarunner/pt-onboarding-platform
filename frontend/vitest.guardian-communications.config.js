import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:[
 'src/components/guardian/__tests__/GuardianInvitations.test.js',
 'src/components/conversa/__tests__/ClientNotificationHistory.test.js',
 'src/components/messages/__tests__/QaRecipientEmailInbox.test.js'
]}});
