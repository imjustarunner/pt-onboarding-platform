import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/school/reinit/__tests__/SchoolReinitDashboard.test.js','src/components/admin/__tests__/SchoolAnnualCycle.test.js','src/router/__tests__/schoolCareBridgeRoutes.test.js'],restoreMocks:true}});
