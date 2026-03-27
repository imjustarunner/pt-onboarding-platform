<template>
  <div class="pi-ins">
    <!-- Step description + non-Medicaid disclaimer -->
    <p v-if="stepConfig.nonMedicaidDisclaimerText && !allMedicaid" class="pi-ins-disclaimer">
      {{ stepConfig.nonMedicaidDisclaimerText }}
    </p>

    <!-- PRIMARY INSURANCE -->
    <div class="pi-ins-card">
      <h4 class="pi-ins-card-title">Primary Insurance</h4>

      <div class="form-group">
        <label class="pi-ins-lbl">Insurance provider <span class="req">*</span></label>
        <div class="pi-ins-typeahead" ref="primarySearchRef">
          <input
            v-model="primaryQuery"
            type="text"
            class="pi-ins-input"
            placeholder="Start typing to search (e.g. Health First Colorado, Aetna…)"
            autocomplete="off"
            @input="onPrimaryInput"
            @focus="primaryOpen = true"
            @blur="onPrimaryBlur"
          />
          <div v-if="primaryOpen && primarySuggestions.length" class="pi-ins-dropdown">
            <div
              v-for="ins in primarySuggestions"
              :key="ins.label"
              class="pi-ins-option"
              :class="{ 'pi-ins-option--medicaid': ins.group === 'Medicaid' }"
              @mousedown.prevent="selectPrimary(ins)"
            >
              <span>{{ ins.label }}</span>
              <span v-if="ins.group === 'Medicaid'" class="pi-ins-badge">Medicaid</span>
            </div>
          </div>
        </div>
        <div v-if="primaryIsMedicaid" class="pi-ins-medicaid-notice">
          ✓ Medicaid detected — no self-pay cost applies for this program.
        </div>
      </div>

      <div class="pi-ins-grid">
        <div class="form-group">
          <label class="pi-ins-lbl">Member / Policy ID <span class="req">*</span></label>
          <input v-model="local.primary.memberId" class="pi-ins-input" type="text" placeholder="e.g. COA123456789" />
        </div>
        <div class="form-group">
          <label class="pi-ins-lbl">Group number (if applicable)</label>
          <input v-model="local.primary.groupNumber" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div class="form-group">
          <label class="pi-ins-lbl">Subscriber name (if different from guardian)</label>
          <input v-model="local.primary.subscriberName" class="pi-ins-input" type="text" placeholder="First Last" />
        </div>
      </div>

      <!-- Insurance card photos -->
      <div class="pi-ins-photos">
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Insurance card – front</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('primary_front')">
            <img v-if="primaryFrontPreview" :src="primaryFrontPreview" alt="Front of card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder">
              <span>📷</span>
              <span>Tap to take photo or upload</span>
            </div>
          </div>
          <input
            ref="primaryFrontInput"
            type="file"
            accept="image/*"
            capture="environment"
            style="display:none"
            @change="(e) => onPhotoSelected(e, 'primary_front')"
          />
          <button v-if="primaryFrontPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('primary_front')">
            Remove
          </button>
        </div>
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Insurance card – back</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('primary_back')">
            <img v-if="primaryBackPreview" :src="primaryBackPreview" alt="Back of card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder">
              <span>📷</span>
              <span>Tap to take photo or upload</span>
            </div>
          </div>
          <input
            ref="primaryBackInput"
            type="file"
            accept="image/*"
            capture="environment"
            style="display:none"
            @change="(e) => onPhotoSelected(e, 'primary_back')"
          />
          <button v-if="primaryBackPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('primary_back')">
            Remove
          </button>
        </div>
      </div>
    </div>

    <!-- SECONDARY INSURANCE (optional) -->
    <div class="pi-ins-secondary-toggle">
      <label class="checkbox-row">
        <input v-model="hasSecondary" type="checkbox" />
        <span>I have secondary insurance to add</span>
      </label>
    </div>

    <div v-if="hasSecondary" class="pi-ins-card">
      <h4 class="pi-ins-card-title">Secondary Insurance</h4>

      <div class="form-group">
        <label class="pi-ins-lbl">Secondary insurance provider</label>
        <div class="pi-ins-typeahead">
          <input
            v-model="secondaryQuery"
            type="text"
            class="pi-ins-input"
            placeholder="Start typing to search…"
            autocomplete="off"
            @input="onSecondaryInput"
            @focus="secondaryOpen = true"
            @blur="onSecondaryBlur"
          />
          <div v-if="secondaryOpen && secondarySuggestions.length" class="pi-ins-dropdown">
            <div
              v-for="ins in secondarySuggestions"
              :key="ins.label"
              class="pi-ins-option"
              :class="{ 'pi-ins-option--medicaid': ins.group === 'Medicaid' }"
              @mousedown.prevent="selectSecondary(ins)"
            >
              <span>{{ ins.label }}</span>
              <span v-if="ins.group === 'Medicaid'" class="pi-ins-badge">Medicaid</span>
            </div>
          </div>
        </div>
      </div>

      <div class="pi-ins-grid">
        <div class="form-group">
          <label class="pi-ins-lbl">Member / Policy ID</label>
          <input v-model="local.secondary.memberId" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div class="form-group">
          <label class="pi-ins-lbl">Group number</label>
          <input v-model="local.secondary.groupNumber" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
        <div class="form-group">
          <label class="pi-ins-lbl">Subscriber name</label>
          <input v-model="local.secondary.subscriberName" class="pi-ins-input" type="text" placeholder="Optional" />
        </div>
      </div>

      <div class="pi-ins-photos">
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Secondary card – front</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('secondary_front')">
            <img v-if="secondaryFrontPreview" :src="secondaryFrontPreview" alt="Front of secondary card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder"><span>📷</span><span>Tap to upload</span></div>
          </div>
          <input ref="secondaryFrontInput" type="file" accept="image/*" capture="environment" style="display:none"
            @change="(e) => onPhotoSelected(e, 'secondary_front')" />
          <button v-if="secondaryFrontPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('secondary_front')">Remove</button>
        </div>
        <div class="pi-ins-photo-slot">
          <label class="pi-ins-lbl">Secondary card – back</label>
          <div class="pi-ins-photo-area" @click="triggerUpload('secondary_back')">
            <img v-if="secondaryBackPreview" :src="secondaryBackPreview" alt="Back of secondary card" class="pi-ins-photo-img" />
            <div v-else class="pi-ins-photo-placeholder"><span>📷</span><span>Tap to upload</span></div>
          </div>
          <input ref="secondaryBackInput" type="file" accept="image/*" capture="environment" style="display:none"
            @change="(e) => onPhotoSelected(e, 'secondary_back')" />
          <button v-if="secondaryBackPreview" type="button" class="pi-ins-remove-btn" @click.stop="clearPhoto('secondary_back')">Remove</button>
        </div>
      </div>
    </div>

    <!-- Insurance disclaimer -->
    <div class="pi-ins-footer-notice">
      <p>
        <strong>Please note:</strong> Not all insurances are accepted by all providers.
        If this program or class is not covered by your insurance, we may still submit a claim to your
        insurer in the event coverage has changed. All payments collected via our web application will
        be listed as collected outside of our EHR platform and applied to billing claims as necessary.
        Medicaid (Health First Colorado) clients are enrolled at no cost to the family for eligible programs.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { filterInsurances, isMedicaidInsurer } from '../../utils/coloradoInsurances.js';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  stepConfig: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue', 'medicaid-change']);

// ── Local state ──────────────────────────────────────────────────────────────
const local = reactive({
  primary: {
    insurerName: props.modelValue?.primary?.insurerName || '',
    memberId: props.modelValue?.primary?.memberId || '',
    groupNumber: props.modelValue?.primary?.groupNumber || '',
    subscriberName: props.modelValue?.primary?.subscriberName || '',
    isMedicaid: props.modelValue?.primary?.isMedicaid || false
  },
  secondary: {
    insurerName: props.modelValue?.secondary?.insurerName || '',
    memberId: props.modelValue?.secondary?.memberId || '',
    groupNumber: props.modelValue?.secondary?.groupNumber || '',
    subscriberName: props.modelValue?.secondary?.subscriberName || '',
    isMedicaid: props.modelValue?.secondary?.isMedicaid || false
  }
});

const hasSecondary = ref(!!(props.modelValue?.secondary?.insurerName));

// Photo file references (File objects kept in memory; uploaded on submit)
const photoFiles = reactive({ primary_front: null, primary_back: null, secondary_front: null, secondary_back: null });
const primaryFrontPreview = ref(props.modelValue?.photos?.primary_front_preview || '');
const primaryBackPreview = ref(props.modelValue?.photos?.primary_back_preview || '');
const secondaryFrontPreview = ref(props.modelValue?.photos?.secondary_front_preview || '');
const secondaryBackPreview = ref(props.modelValue?.photos?.secondary_back_preview || '');

// Refs for file inputs
const primaryFrontInput = ref(null);
const primaryBackInput = ref(null);
const secondaryFrontInput = ref(null);
const secondaryBackInput = ref(null);

// Typeahead
const primaryQuery = ref(local.primary.insurerName);
const primaryOpen = ref(false);
const primarySuggestions = computed(() => filterInsurances(primaryQuery.value).slice(0, 12));

const secondaryQuery = ref(local.secondary.insurerName);
const secondaryOpen = ref(false);
const secondarySuggestions = computed(() => filterInsurances(secondaryQuery.value).slice(0, 12));

const primaryIsMedicaid = computed(() => isMedicaidInsurer(local.primary.insurerName));
const allMedicaid = computed(() => primaryIsMedicaid.value && (!hasSecondary.value || isMedicaidInsurer(local.secondary.insurerName)));

// ── Typeahead handlers ───────────────────────────────────────────────────────
function onPrimaryInput() {
  primaryOpen.value = true;
  local.primary.insurerName = primaryQuery.value;
  local.primary.isMedicaid = isMedicaidInsurer(primaryQuery.value);
  push();
}
function onPrimaryBlur() {
  setTimeout(() => { primaryOpen.value = false; }, 150);
}
function selectPrimary(ins) {
  primaryQuery.value = ins.label;
  local.primary.insurerName = ins.label;
  local.primary.isMedicaid = ins.group === 'Medicaid';
  primaryOpen.value = false;
  push();
}
function onSecondaryInput() {
  secondaryOpen.value = true;
  local.secondary.insurerName = secondaryQuery.value;
  local.secondary.isMedicaid = isMedicaidInsurer(secondaryQuery.value);
  push();
}
function onSecondaryBlur() {
  setTimeout(() => { secondaryOpen.value = false; }, 150);
}
function selectSecondary(ins) {
  secondaryQuery.value = ins.label;
  local.secondary.insurerName = ins.label;
  local.secondary.isMedicaid = ins.group === 'Medicaid';
  secondaryOpen.value = false;
  push();
}

// ── Photo upload ─────────────────────────────────────────────────────────────
function triggerUpload(slot) {
  const map = {
    primary_front: primaryFrontInput,
    primary_back: primaryBackInput,
    secondary_front: secondaryFrontInput,
    secondary_back: secondaryBackInput
  };
  map[slot]?.value?.click();
}
function onPhotoSelected(event, slot) {
  const file = event.target.files?.[0];
  if (!file) return;
  photoFiles[slot] = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (slot === 'primary_front') primaryFrontPreview.value = e.target.result;
    else if (slot === 'primary_back') primaryBackPreview.value = e.target.result;
    else if (slot === 'secondary_front') secondaryFrontPreview.value = e.target.result;
    else if (slot === 'secondary_back') secondaryBackPreview.value = e.target.result;
    push();
  };
  reader.readAsDataURL(file);
}
function clearPhoto(slot) {
  photoFiles[slot] = null;
  if (slot === 'primary_front') primaryFrontPreview.value = '';
  else if (slot === 'primary_back') primaryBackPreview.value = '';
  else if (slot === 'secondary_front') secondaryFrontPreview.value = '';
  else if (slot === 'secondary_back') secondaryBackPreview.value = '';
  push();
}

// ── Emit helpers ─────────────────────────────────────────────────────────────
function push() {
  const out = {
    primary: { ...local.primary },
    secondary: hasSecondary.value ? { ...local.secondary } : null,
    photos: {
      primary_front_preview: primaryFrontPreview.value,
      primary_back_preview: primaryBackPreview.value,
      secondary_front_preview: secondaryFrontPreview.value,
      secondary_back_preview: secondaryBackPreview.value
    },
    hasSecondary: hasSecondary.value,
    primaryIsMedicaid: primaryIsMedicaid.value
  };
  emit('update:modelValue', out);
  emit('medicaid-change', primaryIsMedicaid.value);
}

/** Returns the photo File objects (for upload at form finalize time). */
function getPhotoFiles() {
  return { ...photoFiles };
}

watch([() => local.primary, () => local.secondary, hasSecondary], push, { deep: true });

// Expose for parent
defineExpose({ getPhotoFiles, primaryIsMedicaid });
</script>

<style scoped>
.pi-ins {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pi-ins-disclaimer {
  background: #fef9c3;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: #713f12;
}
.pi-ins-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 16px;
  background: var(--bg, #fff);
}
.pi-ins-card-title {
  margin: 0 0 12px;
  font-size: 1rem;
}
.pi-ins-lbl {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.req { color: var(--danger, #dc2626); }
.pi-ins-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  box-sizing: border-box;
}
.pi-ins-typeahead {
  position: relative;
}
.pi-ins-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.1);
  max-height: 220px;
  overflow-y: auto;
}
.pi-ins-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  gap: 8px;
}
.pi-ins-option:hover { background: #f1f5f9; }
.pi-ins-option--medicaid { background: #f0fdf4; }
.pi-ins-option--medicaid:hover { background: #dcfce7; }
.pi-ins-badge {
  font-size: 11px;
  font-weight: 600;
  background: #16a34a;
  color: #fff;
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}
.pi-ins-medicaid-notice {
  margin-top: 6px;
  font-size: 13px;
  color: #166534;
  font-weight: 600;
}
.pi-ins-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}
@media (max-width: 640px) {
  .pi-ins-grid { grid-template-columns: 1fr; }
}
.pi-ins-photos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}
@media (max-width: 500px) {
  .pi-ins-photos { grid-template-columns: 1fr; }
}
.pi-ins-photo-slot {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pi-ins-photo-area {
  border: 2px dashed var(--border, #cbd5e1);
  border-radius: 10px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  background: var(--bg-alt, #f8fafc);
  transition: border-color .15s;
}
.pi-ins-photo-area:hover { border-color: var(--primary, #0f766e); }
.pi-ins-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pi-ins-photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}
.pi-ins-photo-placeholder span:first-child { font-size: 28px; }
.pi-ins-remove-btn {
  font-size: 12px;
  color: var(--danger, #dc2626);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.pi-ins-secondary-toggle {
  margin-top: 4px;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.pi-ins-footer-notice {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}
.pi-ins-footer-notice p { margin: 0; }
</style>
