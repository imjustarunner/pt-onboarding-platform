import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/auricwell/__tests__/clientParity.test.js','src/auricwell/__tests__/Workspace.test.js','src/auricwell/demo/__tests__/workspaceReuse.test.js','src/auricwell/demo/__tests__/fixtures.test.js','src/auricwell/demo/network.test.js','src/components/schedule/__tests__/scheduleUsability.test.js','src/utils/__tests__/scheduleSummaryRequests.test.js']}});
