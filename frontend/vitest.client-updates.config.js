import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue({template:{transformAssetUrls:false}})],test:{environment:'jsdom',restoreMocks:true,include:['src/components/admin/__tests__/ClientUpdateModal.test.js','src/components/guardian/__tests__/ClientUpdateChecklist.test.js']}});
