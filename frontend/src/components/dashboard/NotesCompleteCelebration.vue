<template>
  <Teleport to="body">
    <Transition name="celebration-fade">
      <div
        v-if="visible"
        class="notes-complete-celebration"
        role="dialog"
        aria-labelledby="celebration-title"
        aria-modal="true"
        @click.self="dismiss"
      >
        <div class="celebration-backdrop" />
        <div class="celebration-content">
          <h2 id="celebration-title" class="celebration-title">
            Congratulations! You got all your notes done this pay period.
          </h2>
          <div class="plus-one-wrap">
            <span class="plus-one">+1</span>
          </div>
          <button type="button" class="btn btn-primary celebration-dismiss" @click="dismiss">
            Awesome
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  show: { type: Boolean, default: false }
});

const emit = defineEmits(['dismiss']);

const visible = ref(false);

watch(
  () => props.show,
  (val) => {
    visible.value = !!val;
  },
  { immediate: true }
);

const dismiss = () => {
  visible.value = false;
  emit('dismiss');
};
</script>

<style scoped>
.notes-complete-celebration {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.celebration-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}

.celebration-content {
  position: relative;
  background: linear-gradient(135deg, #fef9c3 0%, #fef08a 30%, #fde047 100%);
  border: 2px solid #eab308;
  border-radius: 16px;
  padding: 32px 40px;
  max-width: 420px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

.celebration-title {
  margin: 0 0 20px 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1.4;
}

.plus-one-wrap {
  margin-bottom: 24px;
  min-height: 60px;
}

.plus-one {
  display: inline-block;
  font-size: 2.5rem;
  font-weight: 800;
  color: #16a34a;
  animation: plus-one-pop 0.6s ease-out;
}

@keyframes plus-one-pop {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  70% {
    transform: scale(0.95);
  }
  85% {
    transform: translateY(-8px) scale(1);
  }
  100% {
    transform: translateY(-12px) scale(1);
    opacity: 1;
  }
}

.celebration-dismiss {
  min-width: 140px;
}

.celebration-fade-enter-active,
.celebration-fade-leave-active {
  transition: opacity 0.25s ease;
}

.celebration-fade-enter-from,
.celebration-fade-leave-to {
  opacity: 0;
}

.celebration-fade-enter-from .celebration-content,
.celebration-fade-leave-to .celebration-content {
  transform: scale(0.9);
}

.celebration-fade-enter-active .celebration-content,
.celebration-fade-leave-active .celebration-content {
  transition: transform 0.25s ease;
}
</style>
