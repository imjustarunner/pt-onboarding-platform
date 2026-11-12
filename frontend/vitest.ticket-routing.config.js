import base from './vitest.messages-inbox.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,'src/components/messages/__tests__/MessagesHubShell.threading.test.js','src/components/messages/__tests__/EmailComposer.test.js','src/utils/__tests__/notificationActions.test.js']}};
