<template>
  <button type="button" class="clinical-action" :aria-label="busy ? busyLabel : label" :disabled="disabled || busy" :aria-busy="busy || undefined">
    <img :src="artwork" alt="" :class="{ 'clinical-action__hidden': busy }" />
    <span v-if="busy" role="status">{{ busyLabel }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue';
import generateNote from '../../assets/clinical-actions/generate-note.webp';
import openWorkspace from '../../assets/clinical-actions/open-note-workspace.webp';

const props = defineProps({ action: { type: String, required: true }, disabled: Boolean, busy: Boolean });
const workspace = computed(() => props.action === 'workspace');
const artwork = computed(() => workspace.value ? openWorkspace : generateNote);
const label = computed(() => workspace.value ? 'Open Note Workspace' : 'Generate Note with Narriva');
const busyLabel = computed(() => workspace.value ? 'Opening Note Workspace…' : 'Drafting your note…');
</script>

<style scoped>
.clinical-action { display: inline-grid; place-items: center; position: relative; max-width: 100%; min-height: 44px; padding: 0; border: 0; background: transparent; color: #173754; font: inherit; font-weight: 650; cursor: pointer; }
.clinical-action img { display: block; width: min(100%, 235px); height: auto; }
.clinical-action__hidden { visibility: hidden; }
.clinical-action span { position: absolute; text-align: center; }
.clinical-action:disabled { cursor: default; }
.clinical-action:disabled:not([aria-busy="true"]) { opacity: .5; }
.clinical-action:focus-visible { outline: 2px solid #245e92; outline-offset: 3px; border-radius: 8px; }
</style>
