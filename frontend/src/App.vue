<template>
  <AssistantAppShell v-if="assistantSurface"><router-view /></AssistantAppShell>
  <router-view v-else-if="publicLoginSurface" />
  <AppWorkspace v-else />
</template>

<script setup>
import { computed, defineAsyncComponent, h } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './store/auth';
import AssistantAppShell from './components/assistants/AssistantAppShell.vue';

// The ordinary workspace owns employee widgets and polling. Never mount it for
// an assistant, including during a direct navigation to a forbidden staff URL.
const AppWorkspace = defineAsyncComponent({
  loader: () => import('./AppWorkspace.vue'),
  delay: 0,
  loadingComponent: { render: () => h('main', {
    role: 'status', style: 'padding:32px;font:16px/1.5 system-ui,sans-serif;min-height:100vh;box-sizing:border-box'
  }, 'Opening your workspace…') }
});
const route = useRoute();
const auth = useAuthStore();
const assistantSurface = computed(() => String(auth.user?.role || '').toLowerCase() === 'assistant' || route.meta?.assistantSurface === true);
// Sign-in must remain available when an unrelated employee widget cannot load.
// Login views own their branding; authentication and route guards stay in place.
const publicLoginNames = new Set(['Login', 'OrganizationLogin', 'ParentOrganizationLogin']);
const schoolPortalEntryNames = new Set(['SchoolCareBridgeLogin', 'SchoolCareBridgeSchool']);
const publicEnrollmentNames = new Set(['PublicIntakeSigning', 'PublicIntakeSigningShort']);
const publicRecoveryNames = new Set(['SessionEnded', 'OrganizationSessionEnded']);
// Authentication succeeds before LoginView finishes preparing the destination.
// Keep that same form mounted until navigation, including its retry/error state.
const publicLoginSurface = computed(() => publicEnrollmentNames.has(route.name) || publicRecoveryNames.has(route.name) || publicLoginNames.has(route.name)
  || (!auth.isAuthenticated && schoolPortalEntryNames.has(route.name)));
</script>
