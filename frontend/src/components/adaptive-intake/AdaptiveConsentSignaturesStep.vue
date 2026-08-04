<template>
  <div class="ai-consent-step">
    <h1 class="ai-page-title">{{ title }}</h1>
    <p class="ai-page-lead">{{ lead }}</p>

    <div class="ai-consent-list">
      <AdaptiveConsentCard
        v-for="doc in documents"
        :key="doc.id"
        :title="doc.title || doc.name"
        :description="doc.description || defaultDocDescription"
        :icon="doc.icon || '📄'"
        :agreed="!!agreements[doc.id]"
        :signed="!!signedMap[doc.id]"
        :can-view="!!doc.canView"
        @view="$emit('view-document', doc)"
        @update:agreed="(v) => $emit('update-agreement', { id: doc.id, agreed: v })"
      />
    </div>

    <AdaptiveSignatureCapture
      :signer-name="signerName"
      :model-value="signatureData"
      :title="signatureTitle"
      @update:model-value="$emit('update:signatureData', $event)"
      @signed="$emit('signed', $event)"
    />

    <slot />
  </div>
</template>

<script setup>
import AdaptiveConsentCard from './AdaptiveConsentCard.vue';
import AdaptiveSignatureCapture from './AdaptiveSignatureCapture.vue';

defineProps({
  title: { type: String, default: 'Consent & Signatures' },
  lead: {
    type: String,
    default: 'Please review each document and provide your signature. Fields marked as required must be completed before continuing.'
  },
  documents: { type: Array, default: () => [] },
  agreements: { type: Object, default: () => ({}) },
  signedMap: { type: Object, default: () => ({}) },
  signerName: { type: String, default: '' },
  signatureData: { type: String, default: '' },
  signatureTitle: { type: String, default: 'Primary Signature' },
  defaultDocDescription: {
    type: String,
    default: 'Please review this document carefully before agreeing.'
  }
});

defineEmits(['view-document', 'update-agreement', 'update:signatureData', 'signed']);
</script>
