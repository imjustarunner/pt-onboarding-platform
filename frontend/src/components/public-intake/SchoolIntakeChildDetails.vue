<template>
  <div class="school-child-details">
    <p>{{ es ? 'Ingrese los datos de cada niño. Después responderá las preguntas de cada uno y revisará los formularios compartidos una vez.' : 'Enter each child’s details here. Next, answer questions for each child, then review the shared forms once.' }}</p>
    <section v-for="(child, index) in clients" :key="index" class="child-details-card" :data-child-index="index" :aria-labelledby="`child-heading-${index}`">
      <div class="child-details-heading">
        <h4 :id="`child-heading-${index}`">{{ es ? 'Niño' : 'Child' }} {{ index + 1 }} {{ child.firstName ? `— ${child.firstName} ${child.lastName || ''}` : '' }}</h4>
        <button v-if="allowRemove && clients.length > 1" type="button" class="btn btn-secondary btn-sm" @click="$emit('remove', index)">{{ es ? 'Quitar' : 'Remove' }}</button>
      </div>
      <div class="child-details-grid">
        <div class="form-group">
          <label :for="`clientFirstName_${index}`">{{ es ? 'Nombre' : 'First name' }} *</label>
          <input :id="`clientFirstName_${index}`" :value="child.firstName" :aria-invalid="!!errors[index]?.firstName" @input="update(index, 'firstName', $event.target.value)" />
          <span v-if="errors[index]?.firstName" class="error-text">{{ es ? 'Ingrese el nombre.' : 'Enter a first name.' }}</span>
        </div>
        <div class="form-group">
          <label :for="`clientLastName_${index}`">{{ es ? 'Apellido' : 'Last name' }} *</label>
          <input :id="`clientLastName_${index}`" :value="child.lastName" :aria-invalid="!!errors[index]?.lastName" @input="update(index, 'lastName', $event.target.value)" />
          <span v-if="errors[index]?.lastName" class="error-text">{{ es ? 'Ingrese el apellido.' : 'Enter a last name.' }}</span>
        </div>
        <div class="form-group">
          <label :for="`clientDob_${index}`">{{ es ? 'Fecha de nacimiento' : 'Date of birth' }} *</label>
          <input :id="`clientDob_${index}`" :value="child.dateOfBirth" type="date" :max="today" :aria-invalid="!!errors[index]?.dob" @input="update(index, 'dateOfBirth', $event.target.value)" />
          <span v-if="errors[index]?.dob" class="error-text">{{ es ? 'Ingrese una fecha de nacimiento válida.' : 'Enter a valid date of birth.' }}</span>
        </div>
        <IntakeQuestionField v-for="field in visiblePersonalFields(index)" :key="field.key" :field="field" :name-prefix="`child_${index}_`"
          :model-value="answers[index]?.[field.key] ?? ''" :label="field.label" :help="field.helperText || ''" :options="field.options || null"
          :required="!!field.required" :error="!!errors[index]?.[field.key]" @update:model-value="$emit('answer', index, field.key, $event)" />
      </div>
      <template v-if="addressFields.length">
        <h5>{{ es ? 'Domicilio' : 'Home address' }}</h5>
        <label v-if="index > 0" class="same-address-choice">
          <input type="checkbox" :checked="child.sameAddressAsFirst !== false" @change="update(index, 'sameAddressAsFirst', $event.target.checked)" />
          {{ es ? 'Vive en el mismo domicilio que' : 'Lives at the same address as' }} {{ clients[0].firstName || (es ? 'el niño 1' : 'Child 1') }}
        </label>
        <p v-if="index > 0 && child.sameAddressAsFirst !== false" class="shared-address-summary">
          {{ addressSummary || (es ? 'Se usará el domicilio del niño 1.' : 'Child 1’s address will be used here.') }}
        </p>
        <div v-else class="child-details-grid">
          <IntakeQuestionField v-for="field in visibleAddressFields(index)" :key="field.key" :field="field" :name-prefix="`child_${index}_`"
            :model-value="answers[index]?.[field.key] ?? ''" :label="field.label" :required="!!field.required" :error="!!errors[index]?.[field.key]"
            @update:model-value="$emit('answer', index, field.key, $event)" />
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import IntakeQuestionField from '../digital-form/IntakeQuestionField.vue';
import { matchesShowIf } from '../../utils/intakeShowIf.js';
import { childDetailKind } from '../../utils/schoolIntakeChildren.js';
const props = defineProps({ clients: { type: Array, required: true }, answers: { type: Array, required: true },
  fields: { type: Array, default: () => [] }, errors: { type: Array, default: () => [] }, locale: { type: String, default: 'en' }, allowRemove: Boolean });
const emit = defineEmits(['identity', 'answer', 'remove']);
const es = computed(() => props.locale === 'es');
const today = new Date().toISOString().slice(0, 10);
const addressFields = computed(() => props.fields.filter(f => childDetailKind(f).startsWith('address_')));
const personalFields = computed(() => props.fields.filter(f => !childDetailKind(f).startsWith('address_')));
const visiblePersonalFields = index => personalFields.value.filter(f => matchesShowIf(f.showIf, props.answers[index] || {}));
const visibleAddressFields = index => addressFields.value.filter(f => matchesShowIf(f.showIf, props.answers[index] || {}));
const addressSummary = computed(() => addressFields.value.map(f => props.answers[0]?.[f.key]).filter(Boolean).join(', '));
const update = (index, key, value) => emit('identity', index, key, value);
</script>

<style scoped>
.child-details-card { border: 1px solid var(--border-color, #d9e3df); border-radius: 16px; padding: 20px; margin: 18px 0; }
.child-details-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.child-details-heading h4 { margin: 0 0 16px; font-size: 1.15rem; }
.child-details-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
input:not([type=checkbox]) { width: 100%; min-height: 46px; border: 1px solid var(--border-color, #cbd5d1); border-radius: 8px; padding: 10px; box-sizing: border-box; font: inherit; color: inherit; background: var(--bg-primary, white); }
input[aria-invalid=true] { border-color: #c53030; }
h5 { margin: 20px 0 12px; font-size: 1rem; }
.same-address-choice { display: flex; align-items: center; gap: 10px; min-height: 44px; }
.same-address-choice input { width: 20px; height: 20px; }
.shared-address-summary { margin-left: 30px; }
.error-text { color: #b42318; }
</style>
