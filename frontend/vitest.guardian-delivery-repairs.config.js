import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment:'jsdom',restoreMocks:true,include:['src/components/clients/__tests__/ClientPortalInviteDialog.test.js'] }
};
