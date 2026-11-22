<template>
  <main class="reference-page">
    <header class="reference-header">
      <a href="https://plotlinepo.com" rel="noreferrer" aria-label="Plotline home">
        <img src="/assets/plotline/website/brand/logos/plotline-primary-transparent.png" alt="Plotline by PlotTwistCo" />
      </a>
      <span>Hiring &amp; careers</span>
      <span class="invitation-label">Private reference invitation</span>
    </header>
    <div class="reference-layout">
      <aside class="reference-aside">
        <p class="eyebrow">The people behind the work</p>
        <h1>A little insight.<br /><span>A meaningful impact.</span></h1>
        <p>Thank you for sharing your professional experience. Your perspective helps {{ meta?.agencyName || 'the hiring team' }} make thoughtful hiring decisions.</p>
        <div v-if="meta" class="request-card">
          <p class="eyebrow">Your reference request</p>
          <h2>{{ meta.candidateLabel }}</h2>
          <p>Requested by {{ meta.agencyName }} · People Operations</p>
        </div>
        <div class="plotline-discover">
          <p>Hiring for your own team?</p>
          <a href="https://plotlinepo.com/plotline/start" target="_blank" rel="noopener noreferrer">Want to use Plotline for your organization?</a>
        </div>
      </aside>
      <section class="reference-main" aria-live="polite">
        <p v-if="loading" role="status">Loading your reference request…</p>
        <div v-else-if="loadError" class="reference-card">
          <h2>Reference link unavailable</h2><p role="alert">{{ loadError }}</p>
          <p>Contact the hiring team if you need help with your invitation.</p>
        </div>
        <div v-else-if="done" class="reference-card">
          <p class="eyebrow">Reference received</p>
          <h2>Thank you for your perspective.</h2>
          <p>{{ declined ? 'The hiring team has been told you are unable to provide a reference.' : 'Your response has been sent to ' + meta?.agencyName + '.' }} You can close this window.</p>
          <a href="https://plotlinepo.com/plotline/start" target="_blank" rel="noopener noreferrer">Want to use Plotline for your organization?</a>
        </div>
        <template v-else-if="meta">
          <p class="eyebrow">Professional reference</p>
          <h2>{{ reviewing ? 'Review your responses' : 'Share your perspective' }}</h2>
          <p>Your feedback about {{ meta.candidateLabel }} will help {{ meta.agencyName }} evaluate their application.</p>
          <ol class="reference-progress" aria-label="Reference progress">
            <li :aria-current="!reviewing ? 'step' : null">Your feedback</li>
            <li :aria-current="reviewing ? 'step' : null">Review and submit</li>
          </ol>
          <div v-if="declining" class="reference-card">
            <h3>Unable to provide a reference?</h3>
            <p>We will let the hiring team know. Answers entered on this page will be discarded.</p>
            <p v-if="submitError" role="alert">{{ submitError }}</p>
            <div class="reference-actions"><button type="button" class="secondary" :disabled="submitting" @click="declining = false">Back to questions</button><button type="button" :disabled="submitting" @click="decline">{{ submitting ? 'Saving…' : 'Confirm unable to provide' }}</button></div>
          </div>
          <form v-else class="reference-card" @submit.prevent="submit">
            <p class="reference-notice">{{ meta.disclaimer }}</p>
            <p v-if="meta.expiresAt" class="reference-deadline">Please respond by {{ formatExp(meta.expiresAt) }}.</p>
            <ReferenceAnswers v-if="reviewing" :answers="form" :questionnaire="meta.questionnaire" />
            <ReferenceQuestionnaire v-else-if="meta.questionnaire" :model-value="form" :questionnaire="meta.questionnaire" :candidate-name="meta.candidateLabel" />
            <p v-if="submitError" role="alert" class="reference-error">{{ submitError }}</p>
            <div class="reference-actions">
              <button v-if="!reviewing" type="button" class="secondary" @click="declining = true">Unable to provide a reference</button>
              <button v-if="reviewing" type="button" class="secondary" :disabled="submitting" @click="reviewing = false">Edit responses</button>
              <button type="submit" :disabled="submitting">{{ submitting ? 'Submitting…' : reviewing ? 'Submit reference' : 'Review responses' }}</button>
            </div>
          </form>
          <p class="reference-footer">A hiring experience for {{ meta.agencyName }} · Powered by Plotline by PlotTwistCo</p>
          <a class="reference-footer-link" href="https://plotlinepo.com/plotline/start" target="_blank" rel="noopener noreferrer">Want to use Plotline for your organization?</a>
        </template>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import '../../styles/brandTypography.css';
import ReferenceAnswers from '../../components/hiring/ReferenceAnswers.vue';
import ReferenceQuestionnaire from '../../components/hiring/ReferenceQuestionnaire.vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';


const route = useRoute();
const token = computed(() => String(route.params.token || '').trim());

const loading = ref(true);
const loadError = ref('');
const meta = ref(null);

const submitError = ref('');
const submitting = ref(false);
const done = ref(false);
const declining = ref(false);
const declined = ref(false);

const reviewing = ref(false);
const form = reactive({ questionnaireVersion: 2, referenceName: '', relationshipType: '', relationshipOther: '', relationshipDuration: '', strengths: '', developmentAreas: '', wouldHire: '', traits: {}, hireReason: '', additionalComments: '' });

const formatExp = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
};

onMounted(async () => {
  if (!token.value) {
    loadError.value = 'Invalid link.';
    loading.value = false;
    return;
  }
  try {
    const r = await api.get(`/public/hiring/reference/${encodeURIComponent(token.value)}`);
    meta.value = r.data;

    form.referenceName = String(r.data?.referenceName || '').trim();
    form.questionnaireVersion = r.data?.questionnaire?.version || 2;
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Unable to load this reference form.';
  } finally {
    loading.value = false;
  }
});

const submit = async () => {
  if (!reviewing.value) { reviewing.value = true; return; }
  submitError.value = '';
  if (form.relationshipType === 'other' && !String(form.relationshipOther || '').trim()) {
    submitError.value = 'Please describe the relationship when you select “Other”.';
    return;
  }
  submitting.value = true;
  try {
    await api.post(`/public/hiring/reference/${encodeURIComponent(token.value)}/submit`, { ...form });
    done.value = true;
  } catch (e) {
    submitError.value = e.response?.data?.error?.message || 'Submit failed.';
  } finally {
    submitting.value = false;
  }
};
async function decline() {
  submitting.value = true;
  submitError.value = '';
  try {
    await api.post(`/public/hiring/reference/${encodeURIComponent(token.value)}/submit`, { declined: true });
    declined.value = true;
    done.value = true;
  } catch (error) {
    submitError.value = error.response?.data?.error?.message || 'Could not update this reference request.';
  } finally {
    submitting.value = false;
  }
}
</script>
<style scoped>
.reference-footer-link {
  display:none;
}
.reference-page {
  --ref-ink:#133c32;
  --ref-muted:#536b63;
  color:var(--ref-ink);
  background:#f3f1eb;
  min-height:100vh;
  font:16px/1.6 Montserrat,Arial,sans-serif;
}
.reference-header {
  display:flex;
  align-items:center;
  gap:24px;
  background:white;
  padding:24px 4%;
  border-bottom:1px solid #dbe2dc;
}
.reference-header img {
  display:block;
  width:168px;
  max-height:64px;
  object-fit:contain;
}
.reference-header span {
  color:#536b63;
}
.invitation-label {
  margin-left:auto;
  font-size:14px;
}
.reference-layout {
  display:grid;
  grid-template-columns:minmax(270px,32%) 1fr;
  min-height:calc(100vh - 110px);
}
.reference-aside {
  background:linear-gradient(130deg,#143b32,#0b493c);
  color:#e4efe9;
  padding:64px 11%;
  display:flex;
  flex-direction:column;
  gap:28px;
}
.eyebrow {
  font-size:12px;
  font-weight:700;
  letter-spacing:.18em;
  text-transform:uppercase;
}
.reference-aside>.eyebrow {
  color:#e9af91;
}
.reference-aside h1 {
  font-size:clamp(30px,3vw,46px);
  line-height:1.2;
  letter-spacing:-.04em;
  margin:14px 0;
}
.reference-aside h1 span {
  color:#f0b293;
}
.reference-aside>p {
  font-size:18px;
}
.request-card {
  border:1px solid #628579;
  border-radius:20px;
  padding:24px;
  margin-top:30px;
}
.request-card h2 {
  font-size:25px;
  line-height:1.4;
}
.request-card p {
  margin:8px 0;
}
.plotline-discover {
  margin-top:auto;
  padding-top:45px;
}
.plotline-discover a {
  color:#f4c1a6;
  font-weight:600;
  text-underline-offset:4px;
}
.reference-main {
  padding:64px clamp(24px,5vw,80px);
  max-width:1100px;
  box-sizing:border-box;
}
.reference-main>h2 {
  font-size:clamp(28px,3.1vw,43px);
  letter-spacing:-.04em;
  line-height:1.2;
  margin:22px 0;
}
.reference-main>.eyebrow {
  color:#975c42;
}
.reference-main>p {
  color:var(--ref-muted);
}
.reference-card {
  padding:clamp(20px,4vw,45px);
  background:white;
  border:1px solid #dfe3dc;
  border-radius:24px;
  margin:32px 0;
}
.reference-card h2 {
  line-height:1.3;
}
.reference-notice {
  background:#edf5ee;
  border-radius:10px;
  padding:16px;
  font-size:14px;
}
.reference-deadline,.reference-footer {
  font-size:13px;
  color:var(--ref-muted);
}
.reference-progress {
  display:flex;
  list-style:none;
  padding:0;
  gap:16px;
  margin:32px 0;
}
.reference-progress li {
  flex:1;
  border-top:5px solid #dce1da;
  padding-top:12px;
  font-size:14px;
}
.reference-progress [aria-current=step] {
  border-color:#ba7658;
  font-weight:700;
}
.reference-actions {
  display:flex;
  gap:12px;
  justify-content:flex-end;
  margin-top:24px;
}
button {
  background:#133c32;
  color:white;
  border:1px solid #133c32;
  padding:14px 24px;
  border-radius:10px;
  font:inherit;
  font-weight:600;
  cursor:pointer;
}
.secondary {
  background:white;
  color:#133c32;
}
button:disabled {
  opacity:.6;
  cursor:wait;
}
.reference-error {
  color:#9b2820;
}
a {
  color:#135e4a;
}
a:focus-visible,button:focus-visible {
  outline:3px solid #b97350;
  outline-offset:4px;
}
.reference-card :deep(.reference-questionnaire) {
  padding:0;
  border:0;
}
.reference-card :deep(legend) {
  font-size:22px;
  line-height:1.4;
  font-weight:700;
  color:#133c32;
}
.reference-card :deep(label) {
  font-weight:600;
  color:#28463b;
}
.reference-card :deep(input),.reference-card :deep(select),.reference-card :deep(textarea) {
  background:white;
  color:#203d32;
  min-height:48px;
  border-color:#b4c5b9;
}
.reference-card :deep(small) {
  color:#52685a;
  font-size:13px;
}
.reference-card :deep(textarea) {
  font-weight:400;
}
@media(max-width:850px) {
  .reference-layout {
    grid-template-columns:1fr;
  }
  .reference-aside {
    padding:30px 24px;
    gap:12px;
  }
  .reference-aside h1 {
    margin:0;
  }
  .reference-aside>p {
    margin:0;
  }
  .request-card {
    margin:5px 0;
    padding:16px;
  }
  .plotline-discover {
    margin:0;
    padding-top:10px;
  }
  .reference-main {
    padding:28px 20px;
    max-width:100%;
  }
  .reference-header {
    padding:18px 20px;
    gap:12px;
    flex-wrap:wrap;
  }
  .reference-header img {
    width:140px;
  }
  .reference-header>span:not(.invitation-label) {
    display:none;
  }
  .invitation-label {
    font-size:12px;
  }
  .reference-actions {
    flex-wrap:wrap;
  }
  .reference-actions button {
    width:100%;
  }
}
@media(max-width:600px) {
  .reference-aside {
    padding:22px 24px;
  }
  .reference-aside > .eyebrow, .reference-aside > p, .request-card, .plotline-discover {
    display:none;
  }
  .reference-aside h1 {
    font-size:28px;
  }
  .reference-footer-link {
    display:block;
    font-size:14px;
    padding:8px 0 20px;
  }
}
</style>
