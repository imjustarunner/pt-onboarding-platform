<template>
  <button
    type="button"
    class="add-sticky-fab"
    title="Add Momentum Sticky"
    aria-label="Add Momentum Sticky"
    @click="onClick"
  >
    <span class="fab-icon">+</span>
  </button>
</template>

<script setup>
import { useMomentumStickiesStore } from '../../store/momentumStickies';

const momentumStore = useMomentumStickiesStore();

const onClick = () => {
  momentumStore.requestExpandOverlay();
  momentumStore.requestCreateNewSticky();
};
</script>

<style scoped>
.add-sticky-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9997;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #fef9c3 0%, #fde047 100%);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.add-sticky-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.add-sticky-fab:active {
  transform: scale(0.98);
}

.fab-icon {
  font-size: 28px;
  font-weight: 300;
  color: #1a1a1a;
  line-height: 1;
}
</style>
