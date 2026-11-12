<template>
  <div class="personalization-fields">
    <p>Write your message once. Use these buttons for details that change for each family—no names or schools to type by hand.</p>
    <div class="field-buttons" role="group" aria-label="Insert automatic details">
      <button v-for="field in fields" :key="field.token" type="button" @mousedown.prevent @click="$emit('insert', field.token)">{{ field.label }}</button>
    </div>
    <small>The preview uses a sample parent. Your name and school fill in automatically. Real messages use each child’s assigned counseling day; you do not need to change these details by hand.</small>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { familyWelcomeFields } from '../../utils/familyWelcome.js';
const props = defineProps({ sms: Boolean });
defineEmits(['insert']);
const fields = computed(() => familyWelcomeFields(props.sms));
</script>
<style scoped>
.personalization-fields{margin:8px 0;color:#425c60;font-size:12px;line-height:1.5}
.personalization-fields p{margin:0 0 8px}.field-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
button{border:1px solid #9cc9e4;border-radius:8px;padding:7px 10px;background:#eaf6fd;color:#075c91;font:inherit;cursor:pointer}
button:focus-visible{outline:3px solid #007cbd;outline-offset:2px}small{display:block}
</style>
