import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/components/dashboard/__tests__/JacquelyneTime.test.js','src/utils/__tests__/hourlyDualRateContract.test.js','src/utils/__tests__/eventTravel.test.js']}});
