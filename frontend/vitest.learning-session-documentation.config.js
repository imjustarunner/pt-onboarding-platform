import vue from '@vitejs/plugin-vue';
export default {root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',restoreMocks:true,include:[
 'src/components/tutoring/__tests__/LearningPlanSessionChecklist.test.js',
 'src/components/tutoring/__tests__/TutoringSessionLearningPanel.test.js',
 'src/views/tutoring/__tests__/VirtualTutoringEntry.test.js',
 'src/components/clinical/__tests__/ClinicalRecordDownloads.test.js'
]}};
