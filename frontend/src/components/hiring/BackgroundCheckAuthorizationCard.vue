<template>
  <section v-if="summary?.signed || loading" class="bgc">
    <div class="bgc-head">
      <h4>Background-check authorization</h4>
      <span v-if="summary?.signed" class="bgc-pill">On file</span>
    </div>
    <p class="muted small">
      Full SSN and driver’s license are encrypted at rest. This screen shows a masked receipt until you reveal them.
      Every reveal is logged.
    </p>
    <div v-if="loading" class="muted small">Loading…</div>
    <template v-else-if="summary?.signed">
      <div class="bgc-kv"><span>Signed</span><strong>{{ summary.signerName || '—' }} · {{ formatWhen(summary.signedAt) }}</strong></div>
      <div class="bgc-kv"><span>SSN</span><strong>{{ revealed?.ssn || summary.ssnMasked || '***' }}</strong></div>
      <div class="bgc-kv"><span>Driver’s license</span><strong>{{ revealed?.driversLicense || summary.dlMasked || '***' }}</strong></div>
      <div v-if="revealed" class="bgc-extra">
        <div class="bgc-kv" v-if="revealed.dateOfBirth"><span>Date of birth</span><strong>{{ revealed.dateOfBirth }}</strong></div>
        <div class="bgc-kv" v-if="revealed.currentAddress"><span>Address</span><strong>{{ revealed.currentAddress }}</strong></div>
        <div class="bgc-kv" v-if="revealed.aliases"><span>Other names</span><strong>{{ revealed.aliases }}</strong></div>
      </div>
      <div class="bgc-actions">
        <button v-if="!revealed" type="button" class="btn btn-primary btn-sm" :disabled="revealing" @click="reveal">
          {{ revealing ? 'Revealing…' : 'Reveal SSN and license' }}
        </button>
        <button v-else type="button" class="btn btn-secondary btn-sm" @click="hide">Hide</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="accessLog.length" class="bgc-log">
        <div class="bgc-log-title">Who viewed the full numbers</div>
        <ul>
          <li v-for="(row, i) in accessLog" :key="`${row.viewerUserId}-${row.viewedAt}-${i}`">
            {{ row.viewerName }} · {{ formatWhen(row.viewedAt) }}
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  initialSummary: { type: Object, default: null }
});

const loading = ref(false);
const revealing = ref(false);
const error = ref('');
const summary = ref(props.initialSummary || null);
const revealed = ref(null);

const accessLog = computed(() => revealed.value?.accessLog || summary.value?.accessLog || []);

const params = computed(() => {
  const agencyId = Number(props.agencyId || 0);
  return agencyId ? { agencyId } : {};
});

const formatWhen = (raw) => {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return String(raw);
  }
};

const load = async () => {
  if (!props.userId) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(
      `/hiring/candidates/${props.userId}/background-check-authorization`,
      { params: params.value }
    );
    summary.value = data;
  } catch {
    summary.value = props.initialSummary?.signed ? props.initialSummary : { signed: false };
  } finally {
    loading.value = false;
  }
};

const reveal = async () => {
  if (!window.confirm('Reveal full SSN and driver’s license? This access is logged with your name and time.')) {
    return;
  }
  revealing.value = true;
  error.value = '';
  try {
    const { data } = await api.post(
      `/hiring/candidates/${props.userId}/background-check-authorization/reveal`,
      {},
      { params: params.value }
    );
    revealed.value = data;
    if (data?.accessLog) {
      summary.value = { ...(summary.value || {}), accessLog: data.accessLog, signed: true };
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not reveal authorization.';
  } finally {
    revealing.value = false;
  }
};

const hide = () => {
  revealed.value = null;
};

watch(
  () => [props.userId, props.agencyId],
  () => {
    revealed.value = null;
    summary.value = props.initialSummary || null;
    load();
  }
);

onMounted(load);
</script>

<style scoped>
.bgc {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
  margin: 12px 0;
}
.bgc-head { display: flex; align-items: center; gap: 8px; }
.bgc-head h4 { margin: 0; }
.bgc-pill {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #166534;
  background: #dcfce7;
  border-radius: 999px;
  padding: 2px 8px;
}
.bgc-kv { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 0.9rem; }
.bgc-kv span { color: #6b7280; }
.bgc-actions { display: flex; gap: 8px; margin-top: 10px; }
.bgc-log { margin-top: 12px; font-size: 0.82rem; color: #374151; }
.bgc-log-title { font-weight: 700; margin-bottom: 4px; }
.bgc-log ul { margin: 0; padding-left: 1.1rem; }
.muted { color: #6b7280; }
.small { font-size: 0.82rem; }
.error { color: #b91c1c; font-weight: 650; }
</style>
