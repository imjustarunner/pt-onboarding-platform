import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: ['src/components/training/__tests__/GuideLessonDeck.test.js', 'src/components/training/__tests__/DocumentLearning.test.js', 'src/components/handbook/__tests__/WorkplaceDocumentLibrary.test.js', 'src/views/__tests__/MyLearning.test.js'] } });
