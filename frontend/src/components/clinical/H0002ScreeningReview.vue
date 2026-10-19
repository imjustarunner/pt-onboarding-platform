<template>
  <Teleport to="body">
    <div class="h0002-backdrop" @click.self="!saving && $emit('close')">
      <section class="h0002-dialog" role="dialog" aria-modal="true" aria-labelledby="h0002-title">
        <header><h2 id="h0002-title">H0002 screening review <span v-if="data">— {{ data.clientCode }}</span></h2><button type="button" :disabled="saving" aria-label="Close screening review" @click="$emit('close')">×</button></header>
        <p v-if="loading">Loading screening…</p>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <template v-if="data">
          <p>Review the digital screening and supplemental history, confirm the admission determination, then sign. Your billing supervisor will receive the note for cosign.</p>
          <p class="muted">Questionnaire received: {{ data.submittedAt }}. Service date on signing: {{ data.reviewServiceDate }} (Mountain time). H0002 is one encounter; no therapy duration is assumed.</p>
          <p v-if="!data.psc.complete" role="alert" class="error">{{ data.psc.invalid ? 'Invalid screening: too many missing items.' : 'The screening is incomplete.' }} {{ data.psc.answered }}/17 valid answers. Obtain missing answers before signing.</p>
          <p v-if="data.safetyFlag" role="alert" class="error">A safety concern was reported. Review the source information and document your safety assessment and follow-up.</p>
          <details open><summary>Screening results and reported history</summary><pre>{{ data.sourceText }}</pre></details>
          <template v-if="!data.signedAt">
            <p><strong>Proposed outcome:</strong> {{ outcomes[data.suggestedOutcome] }}. This suggestion requires your clinical review.</p>
            <p>Edit the proposed assessment and follow-up to reflect your review and selected determination before signing.</p>
            <label>Admission determination
              <select v-model="review.outcome">
                <option value="meets">Does meet criteria</option>
                <option value="does_not_meet" :disabled="data.psc.total !== 0 || data.reportedConcerns">Does not meet criteria</option>
                <option value="further_evaluation">Requires further evaluation</option>
              </select>
            </label>
            <p v-if="review.outcome === 'does_not_meet'">A negative determination requires all-zero responses and no reported concerns. Missing history does not establish that there are no concerns.</p>
            <label v-if="review.outcome === 'does_not_meet'" class="check"><input v-model="review.noConcernsConfirmed" type="checkbox" />I confirmed that no concerns or reasons for treatment were reported.</label>
            <label>Clinical assessment and rationale<textarea v-model="review.assessment" rows="4" maxlength="10000" placeholder="Evaluate the scores together with the reported history and explain your determination." /></label>
            <label>Treatment needs, available options and follow-up<textarea v-model="review.followUp" rows="3" maxlength="10000" placeholder="Document recommended next steps, any needed assessment, and safety follow-up when indicated." /></label>
            <label>Setting of your professional review<input v-model="review.setting" maxlength="10000" placeholder="Where you performed the screening review" /></label>
            <p><strong>Deferred billing code:</strong> R69 — illness, unspecified. This screening does not add a disorder diagnosis to the chart.</p>
            <details><summary>Admission determination preview</summary><p>{{ outcomes[review.outcome] }}</p><p>{{ review.assessment || 'Clinical assessment pending.' }}</p><p>{{ review.followUp || 'Follow-up pending.' }}</p></details>
            <label class="check"><input v-model="review.reviewConfirmed" type="checkbox" />I reviewed the screening results and supplemental history and made this admission determination.</label>
            <label v-if="data.safetyFlag" class="check"><input v-model="review.safetyReviewed" type="checkbox" />I documented the indicated safety assessment and follow-up.</label>
            <label class="check"><input v-model="review.accurateAndComplete" type="checkbox" />The note is accurate and complete.</label>
            <label class="check"><input v-model="review.medicalNecessityAttested" type="checkbox" />This screening service was medically necessary.</label>
            <footer><button type="button" :disabled="saving" @click="$emit('close')">Close</button><button class="btn btn-primary" type="button" :disabled="!canSign || saving" @click="sign">{{ saving ? 'Signing…' : 'Sign and send for cosign' }}</button></footer>
          </template>
          <template v-else><p>Signed {{ data.signedAt }}. Supervisor cosign and claim readiness are tracked separately.</p><pre>{{ data.draftText }}</pre></template>
        </template>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ sessionId: { type: Number, required: true }, agencyId: { type: Number, required: true } });
const emit = defineEmits(['close', 'signed']);
const data = ref(null), loading = ref(true), saving = ref(false), error = ref('');
const outcomes = { meets: 'Screening supports admission to the treatment program, subject to the clinician’s documented assessment and recommended next steps.', does_not_meet: 'Screening does not identify a reason for admission to the treatment program based on all-zero responses and no reported concerns.', further_evaluation: 'Further clinical evaluation is needed before making a final admission decision.' };
const review = reactive({ outcome: 'further_evaluation', assessment: '', followUp: '', setting: '', noConcernsConfirmed: false, reviewConfirmed: false, safetyReviewed: false, accurateAndComplete: false, medicalNecessityAttested: false });
const canSign = computed(() => data.value?.psc.complete && !Object.values(data.value.psc.subscales).some(s => s.score == null)
  && review.assessment.trim().length >= 3 && review.followUp.trim().length >= 3 && review.setting.trim().length >= 3
  && review.reviewConfirmed && review.accurateAndComplete && review.medicalNecessityAttested
  && (!data.value.safetyFlag || review.safetyReviewed)
  && (review.outcome !== 'does_not_meet' || (data.value.psc.total === 0 && !data.value.reportedConcerns && review.noConcernsConfirmed)));
onMounted(async () => {
  try {
    const response = await api.get(`/medical-billing/screening-sessions/${props.sessionId}/review`, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    data.value = response.data;
    review.outcome = data.value.suggestedOutcome;
    review.assessment = data.value.proposedReview?.assessment || '';
    review.followUp = data.value.proposedReview?.followUp || '';
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not load the screening.'; }
  finally { loading.value = false; }
});
async function sign() {
  if (!canSign.value || saving.value) return;
  saving.value = true; error.value = '';
  try {
    const response = await api.post(`/medical-billing/screening-sessions/${props.sessionId}/sign`, { ...review, agencyId: props.agencyId, sourceHash: data.value.sourceHash }, { skipGlobalLoading: true });
    emit('signed', response.data);
  } catch (e) { error.value = e.response?.data?.error?.message || 'Signing failed. Your screening remains available for review.'; }
  finally { saving.value = false; }
}
</script>
<style scoped>
.h0002-backdrop{position:fixed;inset:0;background:#15213388;z-index:15000;display:flex;align-items:center;justify-content:center;padding:20px}
.h0002-dialog{background:var(--bg-primary,#fff);color:var(--text-primary,#172b40);width:min(900px,100%);max-height:94vh;overflow:auto;border-radius:14px;padding:24px;box-shadow:0 18px 60px #0003}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{margin:0}header button{border:0;background:transparent;font-size:28px;cursor:pointer}label{display:flex;flex-direction:column;gap:8px;margin:16px 0;font-weight:600}input,textarea,select{font:inherit;padding:10px;border:1px solid #aebdcb;border-radius:6px}textarea{resize:vertical}.check{flex-direction:row;align-items:flex-start;font-weight:400}.check input{margin-top:4px}pre{white-space:pre-wrap;font:inherit;line-height:1.5;background:var(--bg-secondary,#f3f6f8);padding:16px;border-radius:8px}.muted{color:var(--text-secondary,#536579);font-size:14px}.error{color:#a12525}summary{cursor:pointer;font-weight:600}footer{margin-top:24px;justify-content:flex-end}button:disabled{opacity:.55;cursor:not-allowed}
</style>
