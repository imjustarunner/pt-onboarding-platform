import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: [
  'src/components/clinical/__tests__/SessionSupportingMaterials.test.js',
  'src/components/clinical/__tests__/ClinicalNoteAmendmentFlow.test.js',
  'src/components/schedule/__tests__/OfficeEventSessionNotePanel.test.js'
] } });
