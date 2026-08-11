<template>
  <div class="ieg" role="dialog" aria-modal="true" aria-labelledby="ieg-title">
    <div class="ieg__card">
      <h2 id="ieg-title">{{ headline }}</h2>
      <p class="ieg__body">{{ message }}</p>
      <div v-if="contactEmail || contactPhone" class="ieg__contact">
        <div class="ieg__contact-label">{{ peopleOpsLabel || 'People Operations' }}</div>
        <div v-if="agencyName" class="ieg__agency">{{ agencyName }}</div>
        <a v-if="contactEmail" class="ieg__link" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
        <div v-if="contactPhone" class="ieg__phone">{{ contactPhone }}</div>
      </div>
      <div class="ieg__actions">
        <button type="button" class="btn btn-primary" @click="$emit('done')">
          Done
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  headline: { type: String, default: 'Your interview has ended' },
  message: {
    type: String,
    default:
      'Thank you for your time today — we truly appreciate you meeting with us. If you have any follow-up questions, please reach out to the People Operations team.'
  },
  peopleOpsLabel: { type: String, default: 'People Operations' },
  agencyName: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' }
});

defineEmits(['done']);

const headline = computed(() => props.headline || 'Your interview has ended');
const message = computed(() => props.message);
</script>

<style scoped>
.ieg {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.ieg__card {
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 28px 24px 22px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  text-align: left;
}
.ieg__card h2 {
  margin: 0 0 10px;
  font-size: 1.45rem;
  color: #0f172a;
}
.ieg__body {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.5;
}
.ieg__contact {
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 18px;
}
.ieg__contact-label {
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 2px;
}
.ieg__agency {
  color: #64748b;
  font-size: 0.9rem;
  margin-bottom: 8px;
}
.ieg__link {
  display: block;
  color: #5b21b6;
  margin-bottom: 4px;
}
.ieg__phone {
  color: #334155;
}
.ieg__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
