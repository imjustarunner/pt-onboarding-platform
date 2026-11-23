<template>
  <section class="reference-identity" aria-label="Your reference details">
    <div class="identity-heading"><h3>Your details</h3><button v-if="complete" type="button" class="identity-edit" :aria-expanded="editing" @click="editing = !editing">{{ editing ? 'Done editing details' : 'Edit your details' }}</button></div>
    <p>These details were provided with the application. You can correct them here.</p>
    <dl v-if="!showFields">
      <dt>Name</dt><dd>{{ details.referenceName }}</dd>
      <template v-if="details.referenceEmail"><dt>Email</dt><dd>{{ details.referenceEmail }}</dd></template>
      <template v-if="details.referencePhone"><dt>Phone</dt><dd>{{ details.referencePhone }}</dd></template>
      <template v-if="details.referenceOrganization"><dt>Organization</dt><dd>{{ details.referenceOrganization }}</dd></template>
      <dt>Relationship</dt><dd>{{ relationshipLabel }}</dd>
    </dl>
    <fieldset v-else>
      <legend>{{ complete ? 'Update your details' : 'Complete any missing details' }}</legend>
      <label>Your name <span aria-hidden="true">*</span><input v-model="details.referenceName" name="referenceName" required maxlength="255" autocomplete="name" /></label>
      <label>Email<input v-model="details.referenceEmail" name="referenceEmail" type="email" maxlength="320" autocomplete="email" /></label>
      <label>Phone <span>(optional)</span><input v-model="details.referencePhone" name="referencePhone" type="tel" maxlength="100" autocomplete="tel" /></label>
      <label>Organization <span>(optional)</span><input v-model="details.referenceOrganization" name="referenceOrganization" maxlength="255" autocomplete="organization" /></label>
      <label>Professional relationship <span aria-hidden="true">*</span><select v-model="details.relationshipType" name="relationshipType" required><option value="">Select relationship</option><option value="manager">Direct supervisor</option><option value="coworker">Colleague or coworker</option><option value="direct_report">I reported to them</option><option value="other">Other</option></select></label>
      <label v-if="details.relationshipType === 'other'">Describe your relationship<input v-model="details.relationshipOther" name="relationshipOther" required maxlength="500" /></label>
    </fieldset>
    <p v-if="editing" class="identity-hint">Corrections are saved with your response for the hiring team. They do not change the recipient of this invitation.</p>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ modelValue: { type: Object, required: true } });
const details = computed(() => props.modelValue);
const editing = ref(false);
const complete = computed(() => String(details.value.referenceName || '').trim()
  && ['manager', 'coworker', 'direct_report', 'other'].includes(details.value.relationshipType)
  && (details.value.relationshipType !== 'other' || String(details.value.relationshipOther || '').trim())
  && (!details.value.referenceEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.value.referenceEmail)));
const showFields = computed(() => editing.value || !complete.value);
const relationshipLabel = computed(() => details.value.relationshipType === 'other' ? details.value.relationshipOther
  : { manager: 'Direct supervisor', coworker: 'Colleague or coworker', direct_report: 'I reported to them' }[details.value.relationshipType]);
</script>
<style scoped>
.reference-identity { padding:20px; border:1px solid #dce5dc; border-radius:12px; background:#f6f8f4; margin:24px 0; }
.identity-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
h3 { margin:0; font-size:18px; }
p { font-size:14px; margin:12px 0; }
.identity-edit { border:1px solid #748d7f; background:white; color:#133c32; border-radius:8px; padding:8px 12px; cursor:pointer; font:inherit; font-size:14px; }
dl { display:grid; grid-template-columns:minmax(90px,auto) 1fr; gap:8px 16px; margin-bottom:0; }
dt { font-weight:600; } dd { margin:0; overflow-wrap:anywhere; }
fieldset { border:0; padding:0; min-width:0; } legend { font-weight:600; }
label { display:block; margin:16px 0; font-weight:600; } label span { font-weight:400; }
input,select { display:block; margin-top:6px; padding:12px; width:100%; box-sizing:border-box; border:1px solid #aabbb2; border-radius:10px; font:inherit; }
.identity-hint { color:#536b63; }
button:focus-visible { outline:3px solid #b97350; outline-offset:3px; }
@media(max-width:450px) { dl { grid-template-columns:1fr; gap:4px; } dd { margin-bottom:10px; } }
</style>
