import { createApp, h } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';
import PlotlineWebsite from '../src/views/public/PlotlineWebsite.vue';
const router=createRouter({history:createWebHistory(),routes:[
  {path:'/plottline/:section(product|solutions|careers|resources|about|pricing|start)?',alias:'/plotline/:section(product|solutions|careers|resources|about|pricing|start)?',component:PlotlineWebsite}
],scrollBehavior(to,from,saved){if(saved)return saved;if(to.hash)return {el:to.hash,top:20};return {top:0};}});
createApp({render:()=>h(RouterView)}).use(router).mount('#plotline-site');
