import vue from '@vitejs/plugin-vue';
export default {root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:[
  'src/components/hiring/__tests__/InterviewQuestionPicker.test.js',
  'src/components/hiring/__tests__/JobInterviewGuideEditor.test.js',
  'src/components/hiring/__tests__/CandidateInterviewDefaults.test.js',
  'src/views/admin/__tests__/InterviewHubView.test.js'
]}};
