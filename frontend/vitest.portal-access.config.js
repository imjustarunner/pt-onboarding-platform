import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',environmentOptions:{jsdom:{url:'https://auricwell.com/itsco/login'}},include:['src/views/__tests__/SessionEnded.auricwell.test.js','src/utils/__tests__/completePasswordTokenLogin.portal.test.js'],restoreMocks:true}});
