<template>
  <dl class="payer-fields">
    <template v-for="(field,key) in value" :key="key">
      <dt>{{ label(key) }}</dt>
      <dd v-if="field && typeof field === 'object'"><PayerResponseFields :value="field" /></dd>
      <dd v-else>{{ field == null || field === '' ? 'Not supplied' : field }}</dd>
    </template>
  </dl>
</template>
<script setup>
defineProps({value:{type:[Object,Array],required:true}});
const labels={elig:'Eligibility',eligid:'Response reference',ins_number:'Member ID',ins_name_f:'Subscriber first name',ins_name_l:'Subscriber last name',ins_dob:'Subscriber birth date',group_number:'Group number',plan_begin_date:'Plan start date',plan_end_date:'Plan end date',benefit:'Benefits and related organizations',entity_name:'Organization',entity_code:'Organization role code',entity_description:'Organization role',benefit_description:'Service',benefit_coverage_description:'Coverage information',benefit_notes:'Payer notes',error_mesg:'Payer message',error_code:'Payer error code'};
const label=key=>labels[key] || (/^\d+$/.test(key)?`Item ${Number(key)+1}`:key.replaceAll('_',' '));
</script>
<style scoped>
.payer-fields{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,2fr);gap:8px 16px;margin:12px 0;font-size:.9rem}.payer-fields dt{font-weight:600;overflow-wrap:anywhere}.payer-fields dd{margin:0;overflow-wrap:anywhere}.payer-fields .payer-fields{grid-template-columns:1fr;margin:0}@media(max-width:600px){.payer-fields{grid-template-columns:1fr}}
</style>
