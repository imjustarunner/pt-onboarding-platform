<template>
  <div
    v-if="open"
    class="po-conflict-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="po-conflict-title"
  >
    <div class="po-conflict-card">
      <h2 id="po-conflict-title">You’re on a planned out</h2>
      <p class="po-conflict-lead">
        Your Team Board shows you as
        <strong>{{ availabilityWord }}</strong>
        for this planned out. You’re signed in — choose how you want to appear.
      </p>
      <p v-if="whenLine" class="po-conflict-when muted">{{ whenLine }}</p>
      <p v-if="details" class="po-conflict-details muted">{{ details }}</p>

      <div class="po-conflict-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy"
          @click="choose('stay')"
        >
          Stay unavailable
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="busy"
          @click="choose('available_away')"
        >
          Available · away (reachable)
        </button>
        <button
          type="button"
          class="btn btn-danger"
          :disabled="busy"
          @click="choose('end')"
        >
          I’m back — end planned out
        </button>
      </div>
      <p v-if="error" class="po-conflict-err">{{ error }}</p>
      <p class="po-conflict-hint muted">
        Stay unavailable keeps the red Unavailable status even while you work.
        Available · away keeps the planned out but shows Away · reachable.
        Ending deletes this planned out and its schedule block.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import { usePresenceSessionStore } from '../store/presenceSession';

const props = defineProps({
  open: { type: Boolean, default: false },
  plannedOut: { type: Object, default: null }
});

const emit = defineEmits(['close', 'resolved']);

const agencyStore = useAgencyStore();
const presenceSession = usePresenceSessionStore();
const busy = ref(false);
const error = ref('');

const availabilityWord = computed(() => {
  const a = String(props.plannedOut?.availability || 'unavailable').toLowerCase();
  return a === 'available' ? 'Planned out · available' : 'Unavailable';
});

const details = computed(() => String(props.plannedOut?.details || '').trim());

const whenLine = computed(() => {
  const po = props.plannedOut;
  if (!po) return '';
  const start = String(po.start_date || po.start_at || '').slice(0, 10);
  const end = String(po.end_date || po.end_at || '').slice(0, 10);
  if (!start) return '';
  if (po.all_day || (start && end && start !== end)) {
    // end_date is exclusive for all-day
    let endShow = end;
    if (end && po.all_day) {
      try {
        const d = new Date(`${end}T12:00:00`);
        d.setDate(d.getDate() - 1);
        endShow = d.toISOString().slice(0, 10);
      } catch {
        endShow = end;
      }
    }
    return endShow && endShow !== start ? `Out ${start} – ${endShow}` : `Out ${start}`;
  }
  return `Out ${start}`;
});

watch(
  () => props.open,
  (v) => {
    if (v) error.value = '';
  }
);

async function choose(action) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const agencyId = Number(
      props.plannedOut?.agency_id ||
        agencyStore.currentAgency?.id ||
        0
    );
    await api.post(
      '/presence/planned-out/resolve',
      {
        action,
        agencyId: agencyId || undefined,
        plannedOutId: props.plannedOut?.id || undefined
      },
      { skipGlobalLoading: true }
    );
    try {
      await presenceSession.refreshFromServer();
    } catch {
      /* ignore */
    }
    emit('resolved', { action });
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not update planned out';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.po-conflict-backdrop {
  position: fixed;
  inset: 0;
  z-index: 4800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.5);
}
.po-conflict-card {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.2);
  padding: 22px 22px 18px;
}
.po-conflict-card h2 {
  margin: 0 0 8px;
  font-size: 1.25rem;
  color: #0f172a;
}
.po-conflict-lead {
  margin: 0 0 8px;
  color: #334155;
  line-height: 1.45;
}
.po-conflict-when,
.po-conflict-details {
  margin: 0 0 6px;
  font-size: 0.9rem;
}
.po-conflict-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 16px 0 10px;
}
.po-conflict-actions .btn {
  width: 100%;
  justify-content: center;
}
.po-conflict-err {
  color: #b91c1c;
  margin: 0 0 8px;
  font-size: 0.9rem;
}
.po-conflict-hint {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
}
.muted {
  color: #64748b;
}
</style>
