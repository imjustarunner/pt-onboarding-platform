<template>
  <div class="diagnosis-fields">
    <section v-for="(diagnosis,index) in modelValue" :key="diagnosis.id || diagnosis.icd10_code || diagnosis.code || index">
      <header class="diagnosis-heading"><strong>{{ index === 0 ? 'Primary' : `Diagnosis ${index + 1}` }}: {{ diagnosis.icd10_code || diagnosis.icd10Code || diagnosis.code }} {{ diagnosis.description }}</strong>
      <NarrivaDiagnosticCriteria v-if="criteriaContext" :diagnosis="diagnosis" :agency-id="criteriaContext.agencyId" :draft-id="criteriaContext.draftId" :transport="criteriaContext.transport" :ensure-saved="criteriaContext.ensureSaved" />
      </header>
      <label v-if="/^F43\.2/.test(diagnosisCode(diagnosis)) && (!disabled || diagnosisEventMonth(diagnosis))" class="diagnosis-timing"><span>Precipitating event month and year</span>
        <input :value="diagnosisEventMonth(diagnosis)" :max="dateOfService?.slice(0,7)" :disabled="disabled" :aria-invalid="!disabled && needsMonth(diagnosis)" type="month" @input="update(index,'stressorEventMonth',$event.target.value)" />
        <small v-if="!disabled && needsMonth(diagnosis)" class="diagnosis-field-error">Enter the documented event month and year before signing.</small>
      </label>
      <label v-if="!disabled"><span>Clinical justification <span aria-hidden="true">*</span></span>
      <div class="diagnosis-justification" :data-value="diagnosis.justification"><textarea :value="diagnosis.justification || ''" rows="2" required :data-testid="`diagnosis-justification-${index}`" placeholder="Document the findings, duration and functional impact supporting this diagnosis. Include uncertainty or evidence still needed." @input="update(index,'justification',$event.target.value)" /></div>
      </label>
      <p v-else-if="diagnosis.justification" class="diagnosis-prose">{{ diagnosis.justification }}</p>
    </section>
  </div>
</template>
<script setup>
import { diagnosisEventMonth, diagnosesMissingEventMonth } from '../../utils/noteAidIntakeIntegration.js';
import NarrivaDiagnosticCriteria from './NarrivaDiagnosticCriteria.vue';
const props=defineProps({modelValue:{type:Array,default:()=>[]},disabled:Boolean,criteriaContext:Object,dateOfService:String});
const emit=defineEmits(['update:modelValue']);
const diagnosisCode=diagnosis=>diagnosis.icd10_code || diagnosis.icd10Code || diagnosis.code || '';
const needsMonth = diagnosis => diagnosesMissingEventMonth([diagnosis], props.dateOfService).length > 0;
function update(index,field,value){emit('update:modelValue',props.modelValue.map((item,i)=>i===index?{...item,[field]:value}:item));}
</script>
<style scoped>
.diagnosis-field-error{color:#a4271e}.diagnosis-fields input[aria-invalid="true"]{border-color:#b42318;background:#fff7f6}.diagnosis-fields{display:grid;gap:8px;margin:8px 0}.diagnosis-heading{display:flex;align-items:center;gap:6px}.diagnosis-fields section+section{border-top:1px solid #d7e0e9;padding-top:8px}.diagnosis-fields label{display:grid;gap:4px}.diagnosis-timing{margin:4px 0 8px;max-width:260px}.diagnosis-fields input,.diagnosis-justification::after,.diagnosis-justification textarea{box-sizing:border-box;border:1px solid #bcced8;border-radius:4px;padding:6px;font:inherit;line-height:1.5}.diagnosis-justification{display:grid}.diagnosis-justification::after,.diagnosis-justification textarea{grid-area:1/1;width:100%;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}.diagnosis-justification::after{content:attr(data-value) ' ';visibility:hidden}.diagnosis-justification textarea{resize:vertical;min-height:4em}.diagnosis-prose{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
