<template>
  <div class="participation-pill" v-click-outside="close">
    <button
      type="button"
      class="participation-pill-btn"
      :class="`pill-${currentDecision || 'none'}`"
      :disabled="loading"
      @click="open = !open"
      :title="tooltipText"
    >
      <span class="pill-dot" aria-hidden="true">{{ icon(currentDecision) }}</span>
      <span class="pill-label">{{ label(currentDecision) }}</span>
      <span v-if="!hideCaret" class="pill-caret" aria-hidden="true">▾</span>
    </button>
    <div v-if="open" class="participation-menu">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="participation-menu-item"
        :class="{ active: currentDecision === opt.value }"
        :disabled="saving"
        @click="choose(opt.value)"
      >
        <span class="participation-menu-icon">{{ opt.icon }}</span>
        <span class="participation-menu-text">
          <strong>{{ opt.label }}</strong>
          <small>{{ opt.help }}</small>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const vClickOutside = {
  mounted(el, binding) {
    el.__clickOutside__ = (e) => {
      if (!el.contains(e.target)) binding.value(e);
    };
    document.addEventListener('mousedown', el.__clickOutside__, true);
  },
  unmounted(el) {
    if (el.__clickOutside__) {
      document.removeEventListener('mousedown', el.__clickOutside__, true);
      el.__clickOutside__ = null;
    }
  }
};

const props = defineProps({
  clubId: { type: [Number, String], required: true },
  classId: { type: [Number, String], required: true },
  source: { type: String, default: 'dashboard' },
  hideCaret: { type: Boolean, default: false },
  initial: { type: Object, default: null }
});
const emit = defineEmits(['change', 'enrolled-changed']);

const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const currentDecision = ref(null);
const enrolled = ref(false);

const close = () => { open.value = false; };

const options = [
  { value: 'joined', label: "I'm in", help: "Plan to participate", icon: '✓' },
  { value: 'sitting_out', label: "Sitting this one out", help: "Skip this season; still get future invites", icon: '—' },
  { value: 'remind_me', label: "Remind me when it starts", help: "We'll nudge you near kickoff", icon: '⏰' }
];

const label = (v) => {
  if (v === 'joined') return enrolled.value ? 'Joined' : "I'm in";
  if (v === 'sitting_out') return 'Sitting out';
  if (v === 'remind_me') return 'Remind me';
  return 'Decide';
};
const icon = (v) => {
  if (v === 'joined') return '✓';
  if (v === 'sitting_out') return '—';
  if (v === 'remind_me') return '⏰';
  return '?';
};
const tooltipText = computed(() => {
  if (currentDecision.value === 'joined') {
    return enrolled.value ? 'You are enrolled in this season' : 'You marked yourself in';
  }
  if (currentDecision.value === 'sitting_out') return 'You are sitting this season out';
  if (currentDecision.value === 'remind_me') return "We'll remind you near kickoff";
  return 'Choose how you want to participate';
});

async function load() {
  if (props.initial) {
    currentDecision.value = props.initial.decision || null;
    enrolled.value = !!props.initial.enrolled;
    return;
  }
  loading.value = true;
  try {
    const res = await api.get(
      `/summit-stats/clubs/${props.clubId}/seasons/${props.classId}/my-participation`
    );
    currentDecision.value = res.data?.decision || null;
    enrolled.value = !!res.data?.enrolled;
  } catch (_) {
    currentDecision.value = null;
    enrolled.value = false;
  } finally {
    loading.value = false;
  }
}

async function choose(decision) {
  if (saving.value) return;
  if (decision === currentDecision.value) { open.value = false; return; }
  saving.value = true;
  const prev = currentDecision.value;
  currentDecision.value = decision;
  try {
    await api.put(
      `/summit-stats/clubs/${props.clubId}/seasons/${props.classId}/my-participation`,
      { decision, source: props.source }
    );
    emit('change', { decision, classId: Number(props.classId), clubId: Number(props.clubId) });
  } catch (e) {
    currentDecision.value = prev;
    alert(e?.response?.data?.error?.message || 'Failed to update participation');
  } finally {
    saving.value = false;
    open.value = false;
  }
}

watch(() => [props.clubId, props.classId], () => { load(); });

onMounted(() => { load(); });
</script>

<style scoped>
.participation-pill { position: relative; display: inline-block; }
.participation-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e8f0);
  background: white;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  font-family: inherit;
}
.participation-pill-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}
.participation-pill-btn:disabled { opacity: 0.7; cursor: progress; }
.pill-dot { font-size: 12px; line-height: 1; }
.pill-caret { font-size: 9px; color: var(--text-secondary, #64748b); }

.pill-joined { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
.pill-sitting_out { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
.pill-remind_me { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.pill-none { background: white; border-color: #e2e8f0; color: var(--text-secondary, #475569); }

.participation-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 240px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  padding: 6px;
}
.participation-menu-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary, #0f172a);
}
.participation-menu-item:hover:not(:disabled) {
  background: rgba(79, 70, 229, 0.08);
}
.participation-menu-item.active {
  background: rgba(79, 70, 229, 0.12);
}
.participation-menu-item:disabled { opacity: 0.6; cursor: progress; }
.participation-menu-icon {
  font-size: 14px;
  line-height: 1.2;
  width: 18px;
  text-align: center;
}
.participation-menu-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.participation-menu-text small {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
}
</style>
