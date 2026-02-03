<template>
  <div class="sb-modal-overlay" @click.self="onRequestClose">
    <div class="sb-modal" role="dialog" aria-modal="true" aria-labelledby="sb-modal-title">
      <div class="sb-modal-header">
        <div class="sb-modal-title-wrap">
          <h2 id="sb-modal-title" class="sb-modal-title">Skill Builder availability</h2>
          <div v-if="lockOpen" class="sb-modal-required">Required</div>
        </div>
        <button
          v-if="!lockOpen"
          type="button"
          class="sb-modal-close"
          aria-label="Close"
          @click="onRequestClose"
        >
          ×
        </button>
      </div>

      <div class="sb-modal-body">
        <div class="hint">
          Maintain at least <strong>6 hours/week</strong> and confirm it <strong>every 2 weeks</strong> (current + next week).
        </div>

        <div v-if="error" class="error-box">{{ error }}</div>
        <div v-if="loading" class="muted" style="margin-top: 10px;">Loading…</div>

        <div v-else>
          <div v-if="!pending.skillBuilder?.eligible" class="notice" style="margin-top: 10px;">
            Skill Builder availability is not enabled for your account.
          </div>

          <template v-else>
            <div class="notice" v-if="pending.cycle?.weekStartDates?.length">
              <div class="muted" style="margin-bottom: 6px;">
                Next two weeks:
                <strong>{{ pending.cycle.weekStartDates[0] }}</strong> and <strong>{{ pending.cycle.weekStartDates[1] }}</strong>
              </div>
              <div class="muted">
                Confirmation status:
                <span v-for="c in (pending.skillBuilder.confirmations || [])" :key="c.weekStartDate" class="pill-inline">
                  {{ c.weekStartDate }} —
                  <strong>{{ c.confirmedAt ? 'confirmed' : 'needs confirm' }}</strong>
                </span>
              </div>
            </div>

            <div class="form">
              <div class="muted" style="margin-bottom: 10px;">
                Current saved total: <strong>{{ pending.skillBuilder.totalHoursPerWeek }}</strong> hrs/week.
              </div>

              <label class="lbl">Availability blocks</label>
              <div class="slots">
                <div v-for="(b, idx) in skillBuilderForm.blocks" :key="idx" class="slot-row">
                  <select class="select" v-model="b.dayOfWeek">
                    <option v-for="d in dayNames" :key="d" :value="d">{{ d }}</option>
                  </select>
                  <select class="select" v-model="b.blockType">
                    <option value="AFTER_SCHOOL">After school (usually 3:00–4:30, subject to change)</option>
                    <option value="WEEKEND">Weekend (12:00–3:00)</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                  <template v-if="b.blockType === 'CUSTOM'">
                    <input class="input" v-model="b.startTime" placeholder="HH:MM" />
                    <input class="input" v-model="b.endTime" placeholder="HH:MM" />
                  </template>
                  <input class="input" v-model="b.departFrom" placeholder="Departing from (required)" />
                  <input class="input" v-model="b.departTime" type="time" placeholder="Depart time (optional)" />
                  <label class="chk" style="display:flex; align-items:center; gap:6px; margin: 0 6px;">
                    <input type="checkbox" v-model="b.isBooked" />
                    <span class="muted" style="white-space:nowrap;">Already booked</span>
                  </label>
                  <button class="btn btn-secondary btn-sm" type="button" @click="removeSkillBuilderBlock(idx)" :disabled="saving">
                    Remove
                  </button>
                </div>
                <button class="btn btn-secondary btn-sm" type="button" @click="addSkillBuilderBlock" :disabled="saving">Add block</button>
              </div>

              <div v-if="skillBuilderValidationError" class="error-box" style="margin-top: 10px;">{{ skillBuilderValidationError }}</div>

              <div class="actions" style="gap: 8px;">
                <button class="btn btn-secondary" type="button" @click="confirmSkillBuilder" :disabled="saving || !!skillBuilderValidationError">
                  Confirm next 2 weeks
                </button>
                <button class="btn btn-primary" type="button" @click="submitSkillBuilder" :disabled="saving || !!skillBuilderValidationError">
                  Save / Submit availability
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="refresh" :disabled="saving">Refresh</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  agencyId: { type: [Number, String, null], default: null },
  lockOpen: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'confirmed']);

const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');

const pending = reactive({
  skillBuilder: null,
  cycle: null
});

const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const skillBuilderForm = reactive({
  blocks: [
    { dayOfWeek: 'Monday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '', departFrom: '', departTime: '', isBooked: false },
    { dayOfWeek: 'Wednesday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '', departFrom: '', departTime: '', isBooked: false },
    { dayOfWeek: 'Friday', blockType: 'AFTER_SCHOOL', startTime: '', endTime: '', departFrom: '', departTime: '', isBooked: false }
  ]
});

const addSkillBuilderBlock = () => {
  skillBuilderForm.blocks.push({
    dayOfWeek: 'Monday',
    blockType: 'AFTER_SCHOOL',
    startTime: '',
    endTime: '',
    departFrom: '',
    departTime: '',
    isBooked: false
  });
};
const removeSkillBuilderBlock = (idx) => {
  skillBuilderForm.blocks.splice(idx, 1);
};

const minutesForSkillBlock = (b) => {
  const t = String(b?.blockType || '').toUpperCase();
  if (t === 'AFTER_SCHOOL') return 90;
  if (t === 'WEEKEND') return 180;
  const st = String(b?.startTime || '').trim();
  const et = String(b?.endTime || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(st) || !/^\d{1,2}:\d{2}$/.test(et)) return 0;
  const [sh, sm] = st.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = et.split(':').map((x) => parseInt(x, 10));
  if (!(sh >= 0 && sh <= 23 && sm >= 0 && sm <= 59)) return 0;
  if (!(eh >= 0 && eh <= 23 && em >= 0 && em <= 59)) return 0;
  const a = sh * 60 + sm;
  const c = eh * 60 + em;
  return c > a ? (c - a) : 0;
};

const skillBuilderValidationError = computed(() => {
  if (!pending.skillBuilder?.eligible) return '';
  const missingDepartFrom = (skillBuilderForm.blocks || []).some((b) => !String(b?.departFrom || '').trim());
  if (missingDepartFrom) return 'Skill Builders requires a “Departing from” value for every block.';
  const mins = (skillBuilderForm.blocks || []).reduce((sum, b) => sum + minutesForSkillBlock(b), 0);
  if (mins < 360) return 'Skill Builders requires at least 6 hours/week of direct time. Add more blocks.';
  return '';
});

const buildParams = () => {
  const agencyId = props.agencyId === null || props.agencyId === undefined || props.agencyId === '' ? null : Number(props.agencyId);
  return agencyId ? { agencyId } : {};
};

const refresh = async () => {
  try {
    loading.value = true;
    error.value = '';

    const resp = await api.get('/availability/me/pending', { params: buildParams() });
    pending.skillBuilder = resp.data?.skillBuilder || null;
    pending.cycle = resp.data?.cycle || null;

    if (pending.skillBuilder?.eligible) {
      const saved = Array.isArray(pending.skillBuilder.blocks) ? pending.skillBuilder.blocks : [];
      if (saved.length) {
        skillBuilderForm.blocks = saved.map((b) => ({
          dayOfWeek: b.dayOfWeek,
          blockType: b.blockType,
          startTime: b.startTime || '',
          endTime: b.endTime || '',
          departFrom: b.departFrom || '',
          departTime: b.departTime || '',
          isBooked: !!b.isBooked
        }));
      }
    }
  } catch (e) {
    pending.skillBuilder = null;
    pending.cycle = null;
    error.value = e.response?.data?.error?.message || 'Failed to load Skill Builder availability';
  } finally {
    loading.value = false;
  }
};

const submitSkillBuilder = async () => {
  try {
    if (skillBuilderValidationError.value) {
      error.value = skillBuilderValidationError.value;
      return;
    }
    saving.value = true;
    error.value = '';
    await api.post('/availability/me/skill-builder/submit', {
      ...buildParams(),
      blocks: skillBuilderForm.blocks
    });
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit Skill Builder availability';
  } finally {
    saving.value = false;
  }
};

const confirmSkillBuilder = async () => {
  try {
    if (skillBuilderValidationError.value) {
      error.value = skillBuilderValidationError.value;
      return;
    }
    saving.value = true;
    error.value = '';
    const weekStartDates = pending.cycle?.weekStartDates || null;
    await api.post('/availability/me/skill-builder/confirm', {
      ...buildParams(),
      weekStartDates
    });
    await refresh();

    // Refresh user so forced-confirm flag clears immediately in UI.
    await authStore.refreshUser();
    emit('confirmed');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to confirm Skill Builder availability';
  } finally {
    saving.value = false;
  }
};

const onRequestClose = () => {
  if (props.lockOpen) return;
  emit('close');
};

onMounted(refresh);

watch(
  () => props.agencyId,
  () => {
    // If org changes while modal is open, reload data.
    refresh();
  }
);
</script>

<style scoped>
.sb-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
}
.sb-modal {
  width: 96%;
  max-width: 980px;
  max-height: 90vh;
  overflow: hidden;
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}
.sb-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}
.sb-modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.sb-modal-title {
  margin: 0;
  color: var(--text-primary);
}
.sb-modal-required {
  font-size: 12px;
  font-weight: 900;
  color: rgba(127, 29, 29, 0.95);
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.sb-modal-close {
  background: transparent;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
}
.sb-modal-body {
  padding: 16px 18px;
  overflow: auto;
}
.hint { color: var(--text-secondary); }
.muted { color: var(--text-secondary); font-size: 13px; }
.notice { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; color: var(--text-secondary); }
.pill-inline { display: inline-block; margin-left: 8px; }
.error-box { background: #fee; border: 1px solid #fcc; padding: 10px 12px; border-radius: 8px; margin-top: 10px; }
.lbl { display: block; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin: 10px 0 6px; }
.select, .input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-primary); }
.slots { display: flex; flex-direction: column; gap: 8px; }
.slot-row { display: grid; grid-template-columns: 1.1fr 1.2fr 0.9fr 0.9fr 1.1fr auto; gap: 8px; align-items: center; }
.actions { display: flex; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
</style>

