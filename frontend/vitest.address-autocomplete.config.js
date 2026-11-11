import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',restoreMocks:true,include:[
'src/directives/__tests__/addressAutocomplete.test.js','src/utils/__tests__/addressFieldBinding.test.js','src/utils/__tests__/addressZipAutofill.test.js','src/views/__tests__/PublicIntakeAddressAutocomplete.test.js','src/directives/__tests__/staticAddressBindings.test.js'
]}});
