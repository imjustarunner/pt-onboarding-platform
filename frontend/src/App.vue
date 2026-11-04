<template>
  <AssistantAppShell v-if="assistantSurface"><router-view /></AssistantAppShell>
  <AppWorkspace v-else />
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './store/auth';
import AssistantAppShell from './components/assistants/AssistantAppShell.vue';

// The ordinary workspace owns employee widgets and polling. Never mount it for
// an assistant, including during a direct navigation to a forbidden staff URL.
const AppWorkspace = defineAsyncComponent(() => import('./AppWorkspace.vue'));
const route = useRoute();
const auth = useAuthStore();
const assistantSurface = computed(() => String(auth.user?.role || '').toLowerCase() === 'assistant' || route.meta?.assistantSurface === true);
</script>
