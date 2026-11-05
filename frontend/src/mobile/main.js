import { createApp } from 'vue';
import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import MobileApp from './MobileApp.vue';
import { native } from './transport.js';
const router=createRouter({history:native?createMemoryHistory():createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});
createApp(MobileApp).use(router).mount('#app');
