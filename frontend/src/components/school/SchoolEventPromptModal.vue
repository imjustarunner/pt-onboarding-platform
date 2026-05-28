<template>
  <div class="modal-overlay" @click.self="dismiss">
    <div class="modal school-event-prompt-modal" @click.stop>
      <div class="modal-header">
        <h2>{{ promptTitle }}</h2>
        <button class="close" type="button" @click="dismiss">×</button>
      </div>
      <div class="body">
        <p>{{ promptMessage }}</p>
        <div class="actions">
          <button type="button" class="btn btn-secondary" @click="dismiss">Not now</button>
          <button type="button" class="btn btn-primary" @click="onPost">Post event</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  organizationId: { type: Number, required: true },
  category: { type: String, default: 'back_to_school' },
  year: { type: Number, default: () => new Date().getFullYear() }
});

const emit = defineEmits(['close', 'post']);

const promptTitle = computed(() =>
  props.category === 'spring'
    ? 'Spring event info needed'
    : 'Back to School event info needed'
);

const promptMessage = computed(() =>
  props.category === 'spring'
    ? "Please input your school's spring event info so our team can coordinate support."
    : "Please input your school's back to school event info so our team can coordinate outreach support."
);

const dismissKey = () => `schoolEventPromptDismiss:${props.organizationId}:${props.category}:${props.year}`;

const dismiss = () => {
  try {
    window.localStorage.setItem(dismissKey(), '1');
  } catch {
    // ignore
  }
  emit('close');
};

const onPost = () => {
  dismiss();
  emit('post', props.category);
};
</script>

<style scoped>
.school-event-prompt-modal {
  width: min(480px, 92vw);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.modal-header h2 {
  margin: 0;
  font-size: 1.1rem;
}
.close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
}
.body {
  padding: 16px 18px 18px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
