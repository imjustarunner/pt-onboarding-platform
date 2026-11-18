import vue from '@vitejs/plugin-vue';
export default {root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/clinical/__tests__/NoteAidMseHistory.test.js','src/components/clinical/__tests__/NoteAidCsNoteBuildPanel.preview.test.js'],restoreMocks:true}};
