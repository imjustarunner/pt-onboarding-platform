import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
 root:new URL('.',import.meta.url).pathname,
 plugins:[vue()],
 test:{environment:'jsdom',include:[
  'src/components/admin/__tests__/GuardianContactCard.test.js',
  'src/components/school/__tests__/SchoolRosterAccess.test.js',
  'src/components/school/__tests__/SchoolClientChatModal.test.js',
  'src/components/admin/__tests__/ClientContactDocumentation.test.js',
  'src/components/messages/__tests__/EmailComposer.test.js',
  'src/components/messages/__tests__/MessagesHubShell.threading.test.js',
  'src/components/messages/__tests__/EmailComposerDock.integration.test.js'
 ]}
});
