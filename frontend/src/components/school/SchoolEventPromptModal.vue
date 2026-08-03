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
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
}
.school-event-prompt-modal {
  width: min(480px, 92vw);
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
  color: #0f172a;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: #f8fafc;
  border-radius: 12px 12px 0 0;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #0f172a;
}
.close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
  color: #475569;
}
.body {
  padding: 16px 18px 18px;
  background: #ffffff;
}
.body p {
  margin: 0;
  line-height: 1.5;
  color: #334155;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.btn {
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn-secondary {
  background: #ffffff;
  border-color: #cbd5e1;
  color: #334155;
}
.btn-primary {
  background: var(--primary, #3d6b4f);
  color: #ffffff;
}
</style>
