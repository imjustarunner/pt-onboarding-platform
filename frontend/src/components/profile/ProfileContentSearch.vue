<template>
  <div ref="searchRoot" class="profile-content-search" data-profile-search @focusout="onBlur">
    <label :for="inputId" class="search-label">{{ label }}</label>
    <input :id="inputId" v-model="query" type="search" role="combobox" autocomplete="off"
      placeholder="Search pages, categories, or profile content…" :aria-expanded="open && !!query.trim()"
      :aria-controls="`${inputId}-results`" :aria-activedescendant="open && results.length ? `${inputId}-hit-${highlight}` : undefined"
      aria-autocomplete="list" @focus="onFocus" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="choose(results[highlight])" @keydown.esc="open = false" />
    <div v-if="open && query.trim()" class="search-results">
      <p v-if="loading" role="status">Searching profile content…</p>
      <p v-if="error" role="status">{{ error }}</p>
      <ul :id="`${inputId}-results`" role="listbox" :aria-label="`${label} results`">
        <li v-for="(hit,index) in results" :id="`${inputId}-hit-${index}`" :key="destinationKey(hit)" role="option"
          :aria-selected="highlight === index" :class="{selected:highlight===index}" @pointerdown.prevent="choose(hit)" @mousemove="highlight=index">
          <span class="result-heading"><strong>{{ hit.label }}</strong><small>{{ hit.matchKind }}</small></span>
          <span class="result-path">{{ hit.breadcrumb }}</span>
          <span v-if="hit.snippet" class="result-snippet">{{ hit.snippet }}</span>
        </li>
      </ul>
      <p v-if="!results.length && !loading" role="status">No matching pages or content. Try a section name or a shorter phrase.</p>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { destinationKey, searchProfileContent } from '../../navigation/profileContentSearch.js';
const props = defineProps({ targets:{type:Array,default:()=>[]}, label:{type:String,default:'Search this profile'}, inputId:{type:String,default:'profile-content-search'}, loading:Boolean, error:String, scopeKey:[String,Number] });
const emit=defineEmits(['select','load']);
const query=ref(''),open=ref(false),highlight=ref(0),searchRoot=ref(null);
const results=computed(()=>searchProfileContent(query.value,props.targets));
watch(results,()=>highlight.value=0);
watch(()=>props.scopeKey,()=>{query.value='';open.value=false;});
watch(query,()=>{open.value=true;if(query.value.trim())emit('load');});
function onFocus(){open.value=true;emit('load');}
function move(delta){open.value=true;if(results.value.length)highlight.value=(highlight.value+delta+results.value.length)%results.value.length;}
function choose(hit){if(!hit)return;open.value=false;query.value='';emit('select',hit);}
function onBlur(event){if(!searchRoot.value?.contains(event.relatedTarget))open.value=false;}
</script>
<style scoped>
.profile-content-search{position:relative;max-width:760px;margin:12px 0 20px;z-index:30}.search-label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text-secondary,#475569)}input{box-sizing:border-box;width:100%;padding:11px 14px;border:1px solid var(--border-color,#b8c7c3);border-radius:10px;background:var(--bg-primary,#fff);color:var(--text-primary,#172b24);font:inherit}input:focus{outline:2px solid #458c79;outline-offset:2px}.search-results{position:absolute;top:100%;left:0;right:0;max-height:420px;overflow:auto;background:var(--bg-primary,#fff);border:1px solid var(--border-color,#cbd5e1);border-radius:10px;box-shadow:0 12px 30px #0002}ul{list-style:none;margin:0;padding:4px}li{padding:10px 12px;border-radius:6px;cursor:pointer;color:var(--text-primary,#182d25)}li.selected,li:hover{background:var(--bg-secondary,#edf7f3)}.result-heading{display:flex;gap:12px;justify-content:space-between}.result-heading small{font-size:11px;white-space:nowrap;color:var(--text-secondary,#526c60)}.result-path,.result-snippet{display:block;margin-top:4px;font-size:12px;line-height:1.4}.result-path{color:var(--text-secondary,#526c60)}p{padding:8px 12px;font-size:13px;margin:0}
</style>
<style>
.profile-search-highlight{outline:3px solid #458c79!important;outline-offset:5px;border-radius:6px;scroll-margin-top:100px}
@media(prefers-reduced-motion:reduce){.profile-search-highlight{scroll-behavior:auto}}
</style>
