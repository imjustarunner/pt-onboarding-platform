import {defineConfig} from 'vitest/config';
export default defineConfig({root:new URL('.',import.meta.url).pathname,test:{environment:'jsdom',include:['src/utils/__tests__/loginRecoveryRecaptcha.test.js']}});
