import { computed, onBeforeUnmount, shallowReactive, watch } from 'vue';
const immersiveFrames = shallowReactive(new Set());
export const clinicalWorkspaceActive = computed(() => immersiveFrames.size > 0);
export const clinicalWorkspaceContext = Symbol('clinical-workspace');
export function registerClinicalWorkspace(active) {
  const key = Symbol('clinical-frame');
  watch(active, enabled => { if (enabled) immersiveFrames.add(key); else immersiveFrames.delete(key); }, { immediate: true });
  onBeforeUnmount(() => immersiveFrames.delete(key));
}
