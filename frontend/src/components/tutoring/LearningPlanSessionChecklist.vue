<template>
  <section class="learning-checklist">
    <header><div><h3>Session learning record</h3><p>{{ bundle.plan.title }} <span class="plan-label">Approved learning plan</span></p></div><span class="selection-count">{{ selections.length }} selected</span></header>
    <p class="help">Choose learning or session focuses from the saved plan and session brief. Check strategies used and rate today’s performance.</p>
    <label v-if="areas.length > 6" class="search">Find a focus<input v-model="search" type="search" placeholder="Search learning and session focuses" /></label>
    <div class="focus-list">
      <article v-for="area in filteredAreas" :key="area.key" :class="['focus', { selected: entries[area.key]?.selected }]">
        <label class="focus-toggle"><input v-model="entries[area.key].selected" type="checkbox" :disabled="saving" @change="changed" /><span><strong>{{ area.title }}</strong><small>{{ area.goalTitle }} · {{ area.origin }}</small></span></label>
        <div v-if="entries[area.key].selected" class="focus-body">
          <p v-if="area.description" class="help">{{ area.description }}</p>
          <p v-if="area.criteria" class="criteria"><strong>Plan target:</strong> {{ area.criteria }}</p>
          <fieldset class="ratings"><legend>Today’s performance</legend><label v-for="rating in SESSION_RATINGS" :key="rating.key" :class="{ chosen: entries[area.key].rating === rating.key }"><input v-model="entries[area.key].rating" type="radio" :name="`${inputId}-${area.key}`" :value="rating.key" :disabled="saving" @change="ratingChanged(area.key)" /><span><b>{{ rating.score ?? '—' }}</b>{{ rating.label }}</span></label></fieldset>
          <template v-if="entries[area.key].rating !== 'not_observed'">
            <fieldset v-if="strategies.length" class="strategies"><legend>Plan strategies used <small>Optional</small></legend><label v-for="strategy in strategies" :key="strategy.key"><input v-model="entries[area.key].strategyKeys" :value="strategy.key" type="checkbox" :disabled="saving" @change="changed" />{{ strategy.label }}</label></fieldset>
            <label class="result">Observed result <span>Optional · e.g., 6 of 8 correct; two prompts</span><input v-model="entries[area.key].result" maxlength="1000" :disabled="saving" placeholder="Record only what you observed" @input="changed" /></label>
          </template>
          <p v-if="nextStep(area.key)" :class="['next-step', nextStep(area.key) === 'Move forward' ? 'forward' : 'revisit']">{{ nextStep(area.key) }}<span>{{ entries[area.key].rating === 'not_observed' ? 'Progress unchanged' : 'Suggested next focus' }}</span></p>
        </div>
      </article>
    </div>
    <details class="additional"><summary>Additional details <span>Optional</span></summary><label>Additional participants · name and role<input v-model="participantDetails" maxlength="1000" :disabled="saving" placeholder="Only if someone else participated" @input="changed" /></label><label>Relevant learning-plan context<textarea v-model="observation" rows="2" maxlength="1000" :disabled="saving" @input="changed" /></label></details>
    <section class="preview" aria-label="Session narrative preview"><div><h4>Session narrative</h4><span>Updates as you select</span></div><p v-if="preview">{{ preview.summary }}</p><p v-else class="help">{{ validationMessage }}</p></section>
    <p class="help">Ratings 1–2 suggest revisiting; 3–4 suggest moving forward. Mastery is reviewed against the plan’s criteria over time.</p>
    <details v-if="previousNote?.summary" class="previous"><summary>Previously saved session note</summary><p>{{ previousNote.summary }}</p></details>
    <label v-if="needsReplacement" class="replace"><input v-model="replaceExistingNote" type="checkbox" :disabled="saving" />Replace the earlier session note with these plan results. Keep the original in note history.</label>
    <footer><button type="button" :disabled="saving || !preview || (needsReplacement && !replaceExistingNote)" @click="save">{{ saving ? 'Saving…' : 'Save session record' }}</button><span role="status">{{ status }}</span></footer>
  </section>
</template>
<script setup>
import { computed, reactive, ref, useId, watch } from 'vue';
import { SESSION_RATINGS, planFocusAreas, planStrategies, assembleLearningSession } from '../../navigation/tutoringSessionDocumentation';
const props = defineProps({ bundle: { type: Object, required: true }, brief: { type: Object, default: null }, initialChecklist: { type: Object, default: null }, previousNote: { type: Object, default: null }, saving: Boolean, status: { type: String, default: '' } });
const emit = defineEmits(['save', 'dirty']);
const inputId = useId(), entries = reactive({}), observation = ref(''), participantDetails = ref(''), search = ref(''), replaceExistingNote = ref(false);
const areas = computed(() => planFocusAreas(props.bundle, props.brief)), strategies = computed(() => planStrategies(props.bundle, props.brief));
const filteredAreas = computed(() => areas.value.filter(area => `${area.title} ${area.goalTitle}`.toLowerCase().includes(search.value.toLowerCase())));
const selections = computed(() => areas.value.filter(area => entries[area.key]?.selected).map(area => ({ key: area.key, rating: entries[area.key].rating, strategyKeys: entries[area.key].strategyKeys, result: entries[area.key].result })));
const input = computed(() => ({ version: 1, areas: selections.value, observation: observation.value, participantDetails: participantDetails.value }));
const assembled = computed(() => { try { return { preview: assembleLearningSession(props.bundle, input.value, props.brief) }; } catch (error) { return { message: error.message }; } });
const preview = computed(() => assembled.value.preview), validationMessage = computed(() => assembled.value.message);
const needsReplacement = computed(() => !!props.previousNote?.summary && !props.previousNote?.metadata_json?.planChecklist);
const nextStep = key => SESSION_RATINGS.find(rating => rating.key === entries[key]?.rating)?.next;
function changed() { emit('dirty'); }
function ratingChanged(key) { if (entries[key].rating === 'not_observed') { entries[key].strategyKeys = []; entries[key].result = ''; } changed(); }
function save() { if (preview.value) emit('save', { planChecklist: input.value, replaceExistingNote: replaceExistingNote.value }); }
watch(() => [props.bundle, props.brief, props.initialChecklist], () => {
  for (const key of Object.keys(entries)) delete entries[key];
  for (const area of areas.value) {
    const stored = props.initialChecklist?.areas?.find(item => item.key === area.key);
    entries[area.key] = { selected: !!stored, rating: stored?.rating || '', strategyKeys: stored?.strategyKeys ? [...stored.strategyKeys] : [], result: stored?.result || '' };
  }
  observation.value = props.initialChecklist?.observation || ''; participantDetails.value = props.initialChecklist?.participantDetails || ''; search.value = ''; replaceExistingNote.value = false;
}, { immediate: true });
</script>
<style scoped>
.learning-checklist{color:var(--text-primary,#243454);font:14px/1.45 system-ui,sans-serif}.learning-checklist header,.preview>div,.learning-checklist footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.learning-checklist h3{font-size:18px;margin:0}.learning-checklist h4,.learning-checklist p{margin:6px 0}.plan-label,.selection-count{display:inline-block;font-size:11px;border-radius:12px;background:#edf3f3;padding:3px 9px;color:#31554f}.plan-label{margin-left:6px}.selection-count{white-space:nowrap}.help,.result>span,.preview>div>span,.additional summary>span{font-size:12px;color:var(--text-secondary,#5c6879)}.focus-list{display:grid;gap:8px;margin-top:14px}.focus{border:1px solid var(--border-color,#d5dce6);border-radius:10px;background:var(--bg-card,#fff);overflow:hidden}.focus.selected{border-color:#77a59d}.focus-toggle{display:flex;align-items:flex-start;gap:9px;padding:11px 13px;cursor:pointer}.focus-toggle input{margin-top:4px}.focus-toggle small{display:block;font-size:11px;color:#607080}.focus-body{padding:0 13px 12px 36px}.criteria{font-size:12px;color:#546170}fieldset{border:0;padding:0;margin:12px 0}legend{font-weight:600;font-size:12px;margin-bottom:6px}.ratings{display:flex;flex-wrap:wrap;gap:6px}.ratings label{display:flex;border:1px solid #cdd6e2;border-radius:7px;padding:7px 9px;gap:5px;cursor:pointer;font-size:11px;align-items:center}.ratings label.chosen{background:#eaf4f1;border-color:#467c70}.ratings span{display:flex;align-items:center;gap:6px}.ratings b{font-size:14px}.strategies{display:flex;gap:6px 16px;flex-wrap:wrap}.strategies label{display:flex;align-items:center;gap:5px;font-size:12px}.strategies small{color:#647183;font-weight:400}.result,.additional label,.search{display:grid;gap:4px;font-weight:600;font-size:12px}.result>span{font-weight:400}.learning-checklist input[type=text],.learning-checklist input:not([type]),.learning-checklist input[type=search],.learning-checklist textarea{box-sizing:border-box;width:100%;border:1px solid #cdd6e2;border-radius:7px;padding:9px;font:inherit;background:var(--bg-card,#fff);color:inherit}.learning-checklist input[type=checkbox],.learning-checklist input[type=radio]{accent-color:#346b60}.next-step{display:flex;gap:12px;align-items:center;font-size:12px;font-weight:700}.next-step span{font-weight:400;font-size:11px;color:#687480}.forward{color:#23634d}.revisit{color:#805a25}.preview{border-left:3px solid #68beb2;background:var(--bg-secondary,#f3f7f8);border-radius:0 8px 8px 0;padding:12px 14px;margin:14px 0 8px}.preview h4{font-size:13px}.preview p{font-size:13px;white-space:pre-line}.additional,.previous{margin-top:12px}.additional summary,.previous summary{cursor:pointer;font-size:12px}.additional label{margin-top:8px}.previous p{font-size:12px;white-space:pre-line}.replace{display:flex;align-items:flex-start;gap:7px;margin-top:10px;font-size:12px}.learning-checklist footer{margin-top:14px;justify-content:flex-start}.learning-checklist button{background:#243454;color:white;border:0;border-radius:8px;padding:10px 18px;font:600 13px system-ui;cursor:pointer}.learning-checklist button:disabled{opacity:.5;cursor:default}.learning-checklist footer span{font-size:12px}@media(max-width:600px){.focus-body{padding-left:13px}.ratings label{flex:1 1 120px}.plan-label{display:table;margin:4px 0 0}.learning-checklist header{align-items:flex-start}}
</style>
