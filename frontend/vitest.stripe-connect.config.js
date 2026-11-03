import vue from '@vitejs/plugin-vue';
export default {root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/admin/__tests__/AgencyStripeConnectSection.test.js'],restoreMocks:true}};
