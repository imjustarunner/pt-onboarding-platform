<template>
  <div class="billing-lookup-action" @mouseenter="hovered=true;dismissed=false" @mouseleave="hovered=false" @focusin="focused=true;dismissed=false" @focusout="leaveFocus" @keydown.esc="dismissHelp">
    <div class="lookup-buttons">
      <button type="button" class="btn btn-secondary" :disabled="disabled" :aria-describedby="helpId" @click="open"><slot /></button>
      <button type="button" class="lookup-help-button" :aria-label="`About ${help.title}`" :aria-expanded="visible" :aria-controls="helpId" @click="toggleHelp">?</button>
    </div>
    <aside v-show="visible" :id="helpId" class="lookup-help" role="tooltip">
      <strong>{{ help.title }}</strong>
      <p>{{ help.when }}</p>
      <p>{{ help.prepare }}</p>
      <p>{{ help.limit }}</p>
      <p class="lookup-cost-note">Opening this form or viewing saved history does not start a paid check. A new paid request requires your confirmation.</p>
    </aside>
  </div>
</template>
<script setup>
import {ref,computed} from 'vue';
const props=defineProps({kind:{type:String,required:true,validator:v=>['discovery','cob'].includes(v)},disabled:Boolean});
const emit=defineEmits(['open']);
const helpId=`billing-lookup-help-${crypto.randomUUID()}`;
const hovered=ref(false),focused=ref(false),pinned=ref(false),dismissed=ref(false);
const visible=computed(()=>!dismissed.value && (hovered.value || focused.value || pinned.value));
const explanations={
  discovery:{title:'Insurance Discovery',when:'Find possible coverage when insurance or a member ID is unknown, or an eligibility problem needs investigation.',prepare:'Save the client’s legal name, birthdate and address state. Confirm the address, reason, billing office, service date and charge before searching.',limit:'Results can miss coverage. A match needs verification and does not establish which insurer pays first.'},
  cob:{title:'Coordination of Benefits (COB)',when:'Investigate overlapping coverage and billing order using a known policy—for example, when a denial says another insurer should pay first.',prepare:'Start with saved, verified policy details, including member ID, names and birthdates. Check that the exact payer participates, then confirm the details and charge.',limit:'Results can omit coverage or leave billing order undetermined. Unresolved findings need billing follow-up; existing insurance stays on file.'}
};
const help=computed(()=>explanations[props.kind] || explanations.discovery);
function leaveFocus(event){if(!event.currentTarget.contains(event.relatedTarget))focused.value=false;}
function toggleHelp(){pinned.value=!pinned.value;dismissed.value=!pinned.value;}
function dismissHelp(event){if(!visible.value)return;event.preventDefault();event.stopPropagation();pinned.value=false;dismissed.value=true;}
function open(){dismissed.value=true;pinned.value=false;emit('open');}
</script>
<style scoped>
.lookup-buttons{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.lookup-help-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:0 0 30px;border:1px solid var(--border,#b8ccc6);border-radius:50%;background:var(--bg-card,#fff);color:var(--primary,#24685d);font-weight:700;cursor:help}.lookup-help-button:focus-visible{outline:3px solid var(--primary,#24685d);outline-offset:3px}.lookup-help{max-width:680px;margin-top:12px;padding:14px 16px;border-left:4px solid var(--primary,#24685d);border-radius:6px;background:var(--bg-alt,#f0f7f4);color:var(--text-primary,#233b36);font-size:14px;line-height:1.5}.lookup-help p{margin:8px 0 0}.lookup-cost-note{font-weight:600}.lookup-buttons>.btn{max-width:100%;white-space:normal;text-align:left}
</style>
