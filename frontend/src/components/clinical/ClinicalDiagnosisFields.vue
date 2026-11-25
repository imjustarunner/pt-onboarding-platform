<template>
  <div class="diagnosis-fields">
    <section v-for="(diagnosis,index) in modelValue" :key="diagnosis.id || diagnosis.icd10_code || diagnosis.code || index">
      <strong>{{ index === 0 ? 'Primary' : `Diagnosis ${index + 1}` }}: {{ diagnosis.icd10_code || diagnosis.icd10Code || diagnosis.code }} {{ diagnosis.description }}</strong>
      <NarrivaDiagnosticCriteria v-if="criteriaContext" :diagnosis="diagnosis" :agency-id="criteriaContext.agencyId" :draft-id="criteriaContext.draftId" :transport="criteriaContext.transport" :ensure-saved="criteriaContext.ensureSaved" />
      <label><span>Clinical justification <span aria-hidden="true">*</span></span>
      <textarea :value="diagnosis.justification || ''" :disabled="disabled" rows="3" required :data-testid="`diagnosis-justification-${index}`" placeholder="Document the findings, duration and functional impact supporting this diagnosis. Include uncertainty or evidence still needed." @input="update(index,$event.target.value)" />
      </label>
    </section>
  </div>
</template>
<script setup>
import NarrivaDiagnosticCriteria from './NarrivaDiagnosticCriteria.vue';
const props=defineProps({modelValue:{type:Array,default:()=>[]},disabled:Boolean,criteriaContext:Object});
const emit=defineEmits(['update:modelValue']);
function update(index,justification){emit('update:modelValue',props.modelValue.map((item,i)=>i===index?{...item,justification}:item));}
</script>
<style scoped>
.diagnosis-fields{display:grid;gap:12px;margin:12px 0}.diagnosis-fields label{display:grid;gap:6px}.diagnosis-fields textarea{box-sizing:border-box;width:100%;border:1px solid #bcced8;border-radius:7px;padding:9px;font:inherit}
</style>
