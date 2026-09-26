<template>
  <label class="appearance-select"><span>Appearance</span><select v-model="preference" aria-label="Appearance" @change="change"><option value="light">Light</option><option value="dark">Dark</option><option value="system">Match device</option></select></label>
</template>
<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../store/auth';
import { getStoredThemePreference, setThemePreference, persistThemePreference } from '../utils/darkMode';
const auth = useAuthStore();
const preference = ref(getStoredThemePreference(auth.user?.id) || getStoredThemePreference() || 'light');
const sync = () => { preference.value = getStoredThemePreference(auth.user?.id) || getStoredThemePreference() || 'light'; };
watch(() => auth.user?.id, sync);
onMounted(() => { window.addEventListener('appearance-change', sync); window.addEventListener('storage', sync); });
onBeforeUnmount(() => { window.removeEventListener('appearance-change', sync); window.removeEventListener('storage', sync); });
function change() { setThemePreference(auth.user?.id, preference.value); if (auth.user?.id) persistThemePreference(auth.user.id, preference.value); }
</script>
<style scoped>
.appearance-select { display:flex; align-items:center; gap:8px; font-size:.8rem; color:inherit; }
.appearance-select select { border:1px solid var(--border); border-radius:8px; padding:7px 9px; background:var(--bg-card); color:var(--text-primary); font:inherit; }
</style>
