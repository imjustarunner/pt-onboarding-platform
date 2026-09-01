<template>
  <div class="tpa-page">
    <div v-if="loading" class="tpa-state">Loading treatment plan…</div>
    <div v-else-if="fatalError" class="tpa-state tpa-state--err">{{ fatalError }}</div>
    <div v-else-if="signed" class="tpa-shell tpa-shell--thanks">
      <header class="tpa-header">
        <h1>Thank you</h1>
      </header>
      <section class="tpa-card">
        <p class="tpa-lead">
          Your acknowledgment of this treatment plan has been recorded.
        </p>
        <dl class="tpa-signed-meta">
          <div v-if="link?.signed_by_name">
            <dt>Signed by</dt>
            <dd>{{ link.signed_by_name }}</dd>
          </div>
          <div v-if="link?.signed_at">
            <dt>Signed on</dt>
            <dd>{{ formatWhen(link.signed_at) }}</dd>
          </div>
        </dl>
        <p class="tpa-muted">You may close this window. If you have questions, contact your care team.</p>
      </section>
    </div>

    <div v-else class="tpa-shell">
      <header class="tpa-header">
        <p class="tpa-kicker">Treatment plan review</p>
        <h1>{{ plan?.title || 'Treatment plan' }}</h1>
        <p v-if="plan?.effective_date" class="tpa-muted">
          Effective {{ formatDate(plan.effective_date) }}
        </p>
      </header>

      <section class="tpa-card tpa-plan">
        <h2>Goals &amp; objectives</h2>
        <p v-if="!goals.length" class="tpa-muted">No structured goals are listed on this plan.</p>
        <article v-for="g in goals" :key="g.goal_index" class="tpa-goal">
          <h3>
            <span class="tpa-pill">G{{ g.goal_index }}</span>
            {{ g.goal_text }}
          </h3>
          <p v-if="g.projected_completion" class="tpa-muted tiny">
            Timeframe: {{ g.projected_completion }}
          </p>
          <ul v-if="g.objectives?.length" class="tpa-objectives">
            <li v-for="o in g.objectives" :key="o.objective_index">
              <span class="tpa-pill tpa-pill--obj">O{{ o.objective_index }}</span>
              <span>{{ o.objective_text }}</span>
              <span v-if="o.scale_target != null" class="tpa-muted tiny">
                Target: {{ o.scale_target }}
                <template v-if="o.measurement_method"> · {{ o.measurement_method }}</template>
              </span>
            </li>
          </ul>
        </article>

        <div v-if="plan?.diagnostic_justification" class="tpa-block">
          <h3>Clinical justification</h3>
          <p>{{ plan.diagnostic_justification }}</p>
        </div>
        <div v-if="plan?.discharge_plan" class="tpa-block">
          <h3>Discharge plan</h3>
          <p>{{ plan.discharge_plan }}</p>
        </div>
      </section>

      <section class="tpa-card tpa-sign">
        <h2>Your acknowledgment</h2>
        <p class="tpa-lead">
          By signing below, I confirm that I have reviewed this treatment plan and agree to participate
          in the recommended services.
        </p>

        <label class="tpa-field">
          Full legal name
          <input
            v-model="signedByName"
            type="text"
            required
            maxlength="255"
            autocomplete="name"
            placeholder="As it appears on legal documents"
          />
        </label>

        <div class="tpa-signature">
          <label>Signature</label>
          <SignaturePad compact @signed="onSignature" />
        </div>

        <p v-if="submitError" class="tpa-error">{{ submitError }}</p>

        <button
          type="button"
          class="tpa-btn"
          :disabled="submitting || !canSubmit"
          @click="submitSignature"
        >
          {{ submitting ? 'Submitting…' : 'Sign & submit' }}
        </button>
      </section>

      <footer class="tpa-footer">
        <div class="tpa-secure">
          <strong>Secure signing</strong>
          <p>Your signature is stored securely as part of the clinical record.</p>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import SignaturePad from '../components/SignaturePad.vue';

const route = useRoute();
const publicKey = computed(() => String(route.params.publicKey || '').trim());

const loading = ref(true);
const fatalError = ref('');
const submitError = ref('');
const submitting = ref(false);
const link = ref(null);
const plan = ref(null);
const signedByName = ref('');
const signatureDataUrl = ref('');

const apiBase = computed(
  () => `/api/public/treatment-plan-ack/${encodeURIComponent(publicKey.value)}`
);

const goals = computed(() => (Array.isArray(plan.value?.goals) ? plan.value.goals : []));

const signed = computed(() => {
  const st = String(link.value?.status || '');
  return st === 'signed' || !!link.value?.signed_at;
});

const canSubmit = computed(
  () => signedByName.value.trim().length >= 2 && !!signatureDataUrl.value
);

function formatWhen(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDate(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value || '');
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function applyPayload(data) {
  link.value = data.link || null;
  plan.value = data.plan || null;
  if (link.value?.recipient_name && !signedByName.value) {
    signedByName.value = String(link.value.recipient_name);
  }
}

function onSignature(dataUrl) {
  signatureDataUrl.value = dataUrl || '';
}

async function recordViewed() {
  try {
    await axios.post(`${apiBase.value}/viewed`);
  } catch {
    /* non-blocking */
  }
}

async function load() {
  loading.value = true;
  fatalError.value = '';
  try {
    const res = await axios.get(apiBase.value);
    applyPayload(res.data || {});
    document.title = plan.value?.title
      ? `Sign — ${plan.value.title}`
      : 'Treatment plan acknowledgment';
    if (!signed.value) await recordViewed();
  } catch (e) {
    fatalError.value = e?.response?.data?.error?.message || 'This signing link is invalid or expired.';
  } finally {
    loading.value = false;
  }
}

async function submitSignature() {
  if (!canSubmit.value) return;
  submitError.value = '';
  submitting.value = true;
  try {
    const res = await axios.post(`${apiBase.value}/sign`, {
      signedByName: signedByName.value.trim(),
      signatureDataUrl: signatureDataUrl.value
    });
    if (res.data?.link) link.value = { ...link.value, ...res.data.link };
    else link.value = { ...(link.value || {}), status: 'signed', signed_by_name: signedByName.value.trim() };
    document.title = 'Thank you — treatment plan signed';
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || 'Could not save your signature. Please try again.';
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.tpa-page {
  min-height: 100vh;
  background: #f4f7f5;
  color: #0f172a;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.tpa-state {
  max-width: 520px;
  margin: 48px auto;
  text-align: center;
  color: #475569;
}
.tpa-state--err {
  color: #b91c1c;
}
.tpa-shell {
  max-width: 720px;
  margin: 0 auto;
}
.tpa-shell--thanks {
  padding-top: 32px;
}
.tpa-header {
  margin-bottom: 20px;
}
.tpa-kicker {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #166534;
}
.tpa-header h1 {
  margin: 0 0 8px;
  font-size: clamp(1.5rem, 4vw, 2rem);
  line-height: 1.2;
  color: #0f2918;
}
.tpa-lead {
  margin: 0 0 16px;
  line-height: 1.55;
  color: #334155;
}
.tpa-card {
  background: #fff;
  border: 1px solid #dce5df;
  border-radius: 14px;
  padding: 20px 22px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(15, 41, 24, 0.06);
}
.tpa-plan h2,
.tpa-sign h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
  color: #14532d;
}
.tpa-goal {
  padding: 14px 0;
  border-bottom: 1px solid #e8efe9;
}
.tpa-goal:last-child {
  border-bottom: 0;
}
.tpa-goal h3 {
  margin: 0 0 8px;
  font-size: 1rem;
  line-height: 1.45;
  font-weight: 650;
}
.tpa-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  margin-right: 8px;
  border-radius: 6px;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}
.tpa-pill--obj {
  background: #ecfdf5;
  color: #047857;
}
.tpa-objectives {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.tpa-objectives li {
  display: grid;
  gap: 4px;
  padding: 8px 0 8px 4px;
  border-top: 1px dashed #e2ebe4;
  line-height: 1.45;
}
.tpa-block {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e8efe9;
}
.tpa-block h3 {
  margin: 0 0 6px;
  font-size: 0.95rem;
  color: #14532d;
}
.tpa-block p {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
  color: #334155;
}
.tpa-field {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 600;
}
.tpa-field input {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 16px;
  font-weight: 400;
}
.tpa-signature label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}
.tpa-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
  padding: 12px 20px;
  border: 0;
  border-radius: 10px;
  background: #166534;
  color: #fff;
  font-size: 16px;
  font-weight: 650;
  cursor: pointer;
}
.tpa-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.tpa-error {
  color: #b91c1c;
  margin: 8px 0 0;
}
.tpa-muted {
  color: #64748b;
  margin: 0;
}
.tiny {
  font-size: 12px;
}
.tpa-signed-meta {
  display: grid;
  gap: 10px;
  margin: 16px 0;
}
.tpa-signed-meta dt {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.tpa-signed-meta dd {
  margin: 2px 0 0;
  font-weight: 650;
}
.tpa-footer {
  margin-top: 8px;
}
.tpa-secure {
  padding: 14px 16px;
  border-radius: 12px;
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  font-size: 14px;
}
.tpa-secure strong {
  display: block;
  color: #14532d;
  margin-bottom: 4px;
}
.tpa-secure p {
  margin: 0;
  color: #334155;
  line-height: 1.45;
}
</style>
