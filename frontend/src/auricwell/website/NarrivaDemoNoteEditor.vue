<template>
 <section class="nd-output" aria-label="Prepared SOIP note" data-analytics-area="note-editor" data-analytics-ignore>
  <header><div><span>{{ readOnly?'FULL NOTE · READ-ONLY REVIEW':'PREPARED EXAMPLE · EDIT THE DRAFT' }}</span><h3>Review your note, section by section.</h3></div><span>SOIP</span></header>
  <p class="editor-notice">{{ readOnly?'Full provider note for signature review. Editing is unavailable in this review view. All content and signatures are fictional.':'Fictional demo only. Use Edit to try revising a section. Edits stay in this page and disappear on reset or reload. Use fictional text.' }}</p>
  <div class="na-soap-list">
   <article v-for="section in sections" :key="section.key" class="na-soap-card">
    <div class="na-soap-header"><button type="button" class="na-soap-title-btn" :aria-expanded="!collapsed[section.key]" @click="collapsed[section.key]=!collapsed[section.key]"><span class="na-soap-title"><span class="na-soap-letter">{{ section.label[0] }}</span>{{ section.label }}</span><span aria-hidden="true">{{ collapsed[section.key]?'▸':'▾' }}</span></button><button v-if="!readOnly" type="button" class="na-mini-btn" :aria-label="`${editing[section.key]?'Done editing':'Edit'} ${section.label}`" @click="toggle(section.key)">{{ editing[section.key]?'Done':'Edit' }}</button></div>
    <div v-show="!collapsed[section.key]" class="na-soap-body"><textarea v-if="editing[section.key]&&!readOnly" :value="section.text" :aria-label="`Edit ${section.label}`" class="na-textarea" rows="8" maxlength="10000" @input="$emit('edit',{key:section.key,text:$event.target.value})"/><p v-else>{{ section.text }}</p></div>
   </article>
  </div>
 </section>
</template>
<script setup>
import {reactive} from 'vue';
// Match the real Note Workspace's SOIP cards, collapse controls, Edit/Done
// interaction and native textarea. Only the caller's browser state is changed.
defineProps({sections:{type:Array,required:true},readOnly:Boolean});defineEmits(['edit']);
const editing=reactive({}),collapsed=reactive({});
function toggle(key){editing[key]=!editing[key];collapsed[key]=false;}
</script>
<style scoped>
.nd-output{margin-top:20px;min-width:0}.nd-output>header{display:flex;gap:15px;justify-content:space-between;align-items:center;margin-bottom:10px}.nd-output header span{font-size:9px;letter-spacing:1px;color:#6d8199}.nd-output header>span{border:1px solid #d9e4ee;padding:7px;border-radius:6px}.nd-output h3{font-size:19px;line-height:1.5;margin:6px 0;color:#1c3a59}.editor-notice{font-size:11px!important;line-height:1.8!important;margin:0 0 18px!important;color:#647b93}.na-soap-list{display:grid;gap:14px}.na-soap-card{border:1px solid #d8e3ee;border-radius:12px;overflow:hidden;min-width:0}.na-soap-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:#f8fafc}.na-soap-title-btn{flex:1;min-width:0;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0;border:0;background:transparent;text-align:left;font:inherit;color:#203f5c;cursor:pointer}.na-soap-title{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:13px}.na-soap-letter{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:6px;background:#215f97;color:#fff;font-size:12px}.na-mini-btn{font:inherit;font-size:11px;border:1px solid #ccdaea;border-radius:6px;padding:6px 10px;color:#2f5d88;background:#fff;cursor:pointer}.na-soap-body{padding:14px}.na-soap-body>p{font-size:12px!important;line-height:1.9!important;white-space:pre-wrap;margin:0!important;overflow-wrap:anywhere;color:#425f79}.na-textarea{box-sizing:border-box;width:100%;min-height:180px;resize:vertical;border:1px solid #9fbad5;border-radius:8px;background:#fff;padding:12px;font:inherit;font-size:12px;line-height:1.9;color:#294b69}.nd-output :focus-visible{outline:3px solid #bc923f;outline-offset:3px}
</style>
