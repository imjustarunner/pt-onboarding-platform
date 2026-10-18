import { createRouter, createWebHistory } from "vue-router";
import Marketing from "./Marketing.vue";
import Login from "./Login.vue";
import Workspace from "./Workspace.vue";
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/platform/settings", component: () => import("./PlatformSettings.vue") },
    { path: "/join/session", component: () => import("./SessionJoin.vue") },
    { path: "/records-request", component: () => import("./RecordsRequests.vue") },
    { path: "/join/my-room/:slug", component: () => import("./PrivateOfficeJoin.vue") },
    { path: "/plans", component: Marketing },
    { path: "/", component: Marketing },
    { path: "/product", component: Marketing },
    { path: "/security", component: Marketing },
    { path: "/about", component: Marketing },
    { path: "/app", component: Login },
    { path: "/app/:slug/:section?", component: Workspace },
    { path: "/:pathMatch(.*)*", component: Marketing },
  ],
});
export default router;
