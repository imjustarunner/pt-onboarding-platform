import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', include: ['src/components/clinical/__tests__/NoteAidObjectiveRatings.test.js', 'src/components/clinical/__tests__/TreatmentPlanApprovalPanel.test.js', 'src/components/clinical/__tests__/NoteAidTreatmentOptions.test.js'], restoreMocks: true }
};
