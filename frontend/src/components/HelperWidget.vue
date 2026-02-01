<template>
  <div v-if="enabled" class="helper-root" :class="positionClass">
    <button type="button" class="helper-avatar" @click="open = !open" :aria-expanded="open ? 'true' : 'false'">
      <img v-if="imageUrl" :src="imageUrl" alt="Helper" />
      <span v-else aria-hidden="true">?</span>
    </button>

    <div v-if="open" class="helper-panel" @click.stop>
      <div class="helper-head">
        <div class="helper-title">Helper</div>
        <button type="button" class="helper-close" @click="open = false" aria-label="Close helper">×</button>
      </div>

      <div class="helper-msg" v-if="message">
        {{ message }}
      </div>
      <div class="helper-msg dim" v-else>
        (No message configured for this page yet.)
      </div>

      <div class="helper-ai">
        <div class="helper-ai-title">Ask a question</div>
        <input v-model="question" placeholder="(AI wiring comes next)" />
        <button type="button" class="btn btn-secondary btn-sm" @click="answerStub">Ask</button>
        <div v-if="answer" class="helper-answer">{{ answer }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useSuperadminBuilderStore } from '../store/superadminBuilder';
import { useAgencyStore } from '../store/agency';
import { useOverlaysStore } from '../store/overlays';

const props = defineProps({
  // User-facing toggle (can be wired to user_preferences later)
  enabled: { type: Boolean, default: true }
});

const route = useRoute();
const authStore = useAuthStore();
const builderStore = useSuperadminBuilderStore();
const agencyStore = useAgencyStore();
const overlaysStore = useOverlaysStore();

const open = ref(false);
const question = ref('');
const answer = ref('');

const routeName = computed(() => String(route.name || ''));
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const helperConfig = computed(() => {
  // 1) Superadmin local draft override
  if (isSuperAdmin.value) {
    const draft = builderStore.getHelperDraftForRouteName(routeName.value);
    if (draft) return draft;
  }

  // 2) Published per-org config (best-effort; may not be loaded yet)
  if (currentAgencyId.value && routeName.value) {
    const cached = overlaysStore.getCached(currentAgencyId.value, routeName.value);
    const enabled = cached?.helper?.enabled !== false;
    const cfg = cached?.helper?.config || null;
    if (enabled && cfg && typeof cfg === 'object') return cfg;
  }

  // 3) Default global helper config for now
  return {
    enabled: true,
    imageUrl: null,
    message: 'Need help? Toggle the Builder to configure me per page.',
    position: 'bottom_right'
  };
});

const enabled = computed(() => props.enabled && helperConfig.value.enabled !== false);
const imageUrl = computed(() => helperConfig.value.imageUrl);
const message = computed(() => helperConfig.value.message);
const positionClass = computed(() =>
  helperConfig.value.position === 'bottom_left' ? 'bottom-left' : 'bottom-right'
);

watch(() => route.fullPath, () => {
  open.value = false;
  question.value = '';
  answer.value = '';
  // Prefetch published helper config for this page (best-effort).
  if (currentAgencyId.value && routeName.value) {
    overlaysStore.fetchRouteOverlays(currentAgencyId.value, routeName.value);
  }
});

const answerStub = () => {
  if (!question.value.trim()) return;
  answer.value = 'AI is not wired yet — next step is adding a backend endpoint + model provider.';
};
</script>

<style scoped>
.helper-root {
  position: fixed;
  bottom: 18px;
  /* Must sit above app modals (some use z-index 10000). */
  z-index: 19000;
}
.helper-root.bottom-right { right: 18px; }
.helper-root.bottom-left { left: 18px; }

.helper-avatar {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  border: 2px solid var(--border);
  background: white;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.helper-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.helper-panel {
  width: 320px;
  max-width: calc(100vw - 36px);
  margin-top: 10px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  padding: 12px;
}

.helper-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.helper-title {
  font-weight: 900;
  color: var(--text-primary);
}
.helper-close {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  color: var(--text-primary);
}
.helper-msg {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.35;
}
.helper-msg.dim {
  color: var(--text-secondary);
}

.helper-ai {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.helper-ai-title {
  font-weight: 800;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.helper-ai input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 8px;
}
.helper-answer {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>

