import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: ['src/utils/__tests__/loginHandoff.test.js', 'src/utils/__tests__/loginBriefingGate.test.js', 'src/utils/__tests__/pdfFillLayout.test.js', 'src/utils/__tests__/libraryUploads.test.js', 'src/utils/__tests__/handbookNavigation.test.js', 'src/views/__tests__/LibraryView.test.js', 'src/components/library/__tests__/Library*.test.js'] } });
