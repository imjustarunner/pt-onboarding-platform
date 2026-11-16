<template>
  <details v-if="reading" class="english-entry" :open="reading.sourceLocale === 'es'">
    <summary>English packet entry <span>{{ reading.translationStatus === 'reviewed' ? 'Reviewed' : reading.translationStatus === 'unavailable' ? 'Translation needs follow-up' : 'Review proposal' }}</span></summary>
    <p>Compare the English proposal with the source PDF before saving. Names, addresses and identifying numbers stay as written.</p>
    <table v-if="Object.keys(reading.sourceValues).length"><thead><tr><th>Field</th><th>Written answer</th><th>English entry</th></tr></thead><tbody><tr v-for="(value,key) in reading.sourceValues" :key="key"><th>{{ fieldLabels[key] || key }}</th><td>{{ value }}</td><td>{{ proposedValue(key) || 'Confirm from the PDF' }}</td></tr></tbody></table>
    <p v-if="reading.dateOfBirthNeedsReview" class="review-message" role="alert">Confirm the birth date’s month and day from the PDF. The written numeric date is ambiguous and has not been guessed.</p>
    <button v-if="stage === 0" type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('use-details',reading.fields)">Use English packet details</button>
    <button v-if="stage === 1 && reading.parent1.firstName" type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('use-parent',reading.parent1)">Use this parent’s packet details</button>
    <template v-if="stage === 0 && reading.responses.length">
      <p v-if="reading.translationStatus === 'unavailable'" class="review-message" role="alert">Automatic translation is unavailable. The original answers remain here. Enter a reviewed English translation, or leave this review pending.</p>
      <section v-for="response in reading.responses" :key="response.key" class="english-answer">
        <h5>{{ response.label }}</h5>
        <details><summary>{{ response.sourceLocale === 'es' ? 'Original Spanish answer' : 'Original answer' }}</summary><pre :lang="response.sourceLocale">{{ response.sourceText }}</pre></details>
        <label>English answer<textarea :value="answers[response.key] || ''" :aria-label="`${response.label} in English`" :disabled="disabled" rows="3" maxlength="16000" @input="edit(response.key,$event.target.value)" /></label>
      </section>
      <label class="review-check"><input type="checkbox" :checked="reviewed" :disabled="disabled" @change="$emit('update:reviewed',$event.target.checked)" /> I reviewed these English answers against the original packet. Save and continue records this review.</label>
    </template>
    <p v-else-if="reading.responses.length">Review the written English answers on the Client demographics step.</p>
  </details>
</template>
<script setup>
const props=defineProps({reading:Object,stage:Number,answers:{type:Object,default:()=>({})},reviewed:Boolean,disabled:Boolean});
const emit=defineEmits(['update:answers','update:reviewed','use-details','use-parent']);
const fieldLabels={administrativeSex:'Sex',grade:'Grade',preferredLanguage:'Client language',guardianPreferredLanguage:'Parent language',guardianRelationship:'Relationship',dateOfBirth:'Birth date'};
const keys={administrativeSex:'gender',preferredLanguage:'preferred_language',dateOfBirth:'dateOfBirth',grade:'grade'};
function proposedValue(key){return key==='guardianRelationship'?props.reading.parent1.relationshipTitle:props.reading.fields[keys[key] || key];}
function edit(key,value){emit('update:answers',{...props.answers,[key]:value});emit('update:reviewed',false);}
</script>
<style scoped>
.english-entry{padding:12px;border:1px solid #c8ded8;border-radius:8px;background:var(--bg-card,#f6faf8);margin:10px 0;font-size:13px}.english-entry>summary{cursor:pointer;font-weight:700;display:flex;gap:12px;justify-content:space-between}.english-entry>summary span{font-size:12px;font-weight:500}.english-entry p{margin:10px 0;line-height:1.5}.english-entry table{width:100%;border-collapse:collapse;table-layout:fixed;margin:10px 0}.english-entry th,.english-entry td{text-align:left;padding:7px;border-bottom:1px solid #d8e5e0;overflow-wrap:anywhere;vertical-align:top}.english-answer{margin-top:14px}.english-answer h5{margin:0 0 7px}.english-answer pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;padding:9px;background:var(--bg-secondary,#edf3f1)}.english-answer label{display:grid;gap:6px}.english-answer textarea{width:100%;box-sizing:border-box;resize:vertical;padding:9px;border:1px solid var(--app-line,#aabbb5);border-radius:7px;font:inherit;background:var(--bg-card,#fff);color:var(--text-primary,#203f39)}.review-check{display:flex;gap:8px;align-items:start;margin-top:12px;line-height:1.5}.review-message{padding:10px;background:#fff4dc;color:#72561b;border-radius:7px}@media(max-width:560px){.english-entry{padding:9px}.english-entry th,.english-entry td{padding:5px;font-size:12px}.english-entry>summary{flex-wrap:wrap}}
</style>
