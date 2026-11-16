import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root:new URL('.',import.meta.url).pathname, plugins:[vue()], test:{ environment:'jsdom', include:[
  'src/utils/__tests__/portalAuthLocale.test.js','src/views/__tests__/PortalAuthSpanish.test.js',
  'src/views/__tests__/PortalPasswordSetup.test.js','src/utils/__tests__/completePasswordTokenLogin.portal.test.js',
  'src/views/__tests__/LoginPortalIsolation.test.js'
] } });
