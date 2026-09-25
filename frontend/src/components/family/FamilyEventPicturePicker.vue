<template>
  <section class="event-picture-picker" aria-label="Event picture">
    <div class="picture-heading"><strong>Event picture</strong><button type="button" :aria-expanded="open" @click="open=!open">{{ open ? 'Close picture search' : 'Search / change picture' }}</button></div>
    <img class="fcc-art-preview" :src="eventArtwork(modelValue)" alt="Selected event picture" />
    <p>{{ modelValue.artwork ? 'Your uploaded picture' : eventType(modelValue.artworkType || modelValue.eventType).label }} · Changing the picture keeps your event type and color.</p>
    <div v-if="open" class="image-library">
      <label>Search all loaded pictures<input v-model="query" type="search" placeholder="Scheels, green tent, rooftop, Yellowstone…" autocomplete="off" /></label>
      <p role="status">{{ matches.length }} pictures{{ matches.length ? '' : ' — try another search' }}</p>
      <div class="image-library-grid">
        <button v-for="choice in matches.slice(0,limit)" :key="choice.key" type="button" :aria-pressed="!modelValue.artwork && selectedKey===choice.key" @click="choose(choice)">
          <img :src="choice.artwork" alt="" loading="lazy" decoding="async" width="180" height="120" /><span>{{ choice.label }}</span>
        </button>
      </div>
      <button v-if="matches.length>limit" type="button" @click="limit+=24">Show more pictures</button>
    </div>
    <FamilyArtworkPicker :model-value="modelValue.artworkVariant" :event-type="modelValue.artworkType || modelValue.eventType" @change="choose({type:modelValue.artworkType || modelValue.eventType,...$event})" />
    <button v-if="modelValue.artwork || modelValue.artworkType || modelValue.artworkVariant" type="button" @click="emit('update:modelValue',{...modelValue,artwork:null,artworkType:null,artworkVariant:null})">Use automatic picture</button>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import FamilyArtworkPicker from './FamilyArtworkPicker.vue';
import { eventArtwork, eventArtworkChoices, eventType, familyEventTypes } from '../../utils/familyCommandCenter';
const props=defineProps({modelValue:{type:Object,required:true}});
const emit=defineEmits(['update:modelValue']);
const open=ref(false),query=ref(''),limit=ref(24);
const normalize=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Include every variant. Shared images appear once, with every associated search term.
const library=new Map();
for(const type of familyEventTypes)for(const choice of eventArtworkChoices(type.id)){
  const words=[type.label,...(type.artworks?[]:type.keywords||[]),...(type.categories||[]),choice.label].join(' ');
  if(library.has(choice.artwork))library.get(choice.artwork).search+=' '+normalize(words);
  else library.set(choice.artwork,{...choice,type:type.id,key:`${type.id}:${choice.id}`,search:normalize(words)});
}
const matches=computed(()=>{const words=normalize(query.value).split(' ').filter(Boolean);return [...library.values()].filter(c=>words.every(w=>c.search.includes(w)));});
const selectedKey=computed(()=>[...library.values()].find(c=>c.artwork===eventArtwork(props.modelValue))?.key);
watch([query,open],()=>{limit.value=24;});
function choose(choice){emit('update:modelValue',{...props.modelValue,artwork:null,artworkType:choice.type,artworkVariant:choice.id});}
</script>
<style scoped>
.event-picture-picker{margin:16px 0;padding:14px;border:1px solid var(--control);border-radius:12px;min-width:0}
.picture-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.event-picture-picker button{min-height:44px;font:inherit;cursor:pointer;color:var(--ink);background:var(--surface);border:1px solid var(--control);border-radius:9px;padding:8px 12px}
.picture-heading button{color:var(--purple);font-weight:600}
.fcc-art-preview{width:100%;height:150px;object-fit:cover;border-radius:9px;margin-top:12px}
.event-picture-picker p{font-size:13px;color:var(--muted);line-height:1.5}
.image-library label{display:flex;flex-direction:column;gap:8px}
.image-library input{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--control);border-radius:9px;font:inherit;color:var(--ink);background:var(--surface)}
.image-library-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.image-library-grid button{padding:4px;overflow:hidden;min-width:0}
.image-library-grid button[aria-pressed=true]{border:2px solid var(--purple)}
.image-library-grid img{width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border-radius:6px;display:block}
.image-library-grid span{display:block;font-size:13px;padding:6px;line-height:1.4}
button:focus-visible{outline:3px solid var(--purple);outline-offset:2px}
@media(max-width:500px){.image-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
