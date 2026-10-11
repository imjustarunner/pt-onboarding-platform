<template>
  <div class="building-selector">
    <label for="kiosk-building">Choose the building for kiosk setup</label>
    <select id="kiosk-building" :value="route.query.officeId || ''" :disabled="loading" @change="selectBuilding">
      <option value="">Choose a building…</option>
      <option v-for="office in offices" :key="office.id" :value="String(office.id)">{{ office.name }}</option>
    </select>
    <p>Each building has its own code. That code includes all agencies affiliated with the building.</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
  </div>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
const route = useRoute(), router = useRouter();
const offices = ref([]), loading = ref(true), error = ref('');
async function load() {
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/offices');
    offices.value = [...data].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  } catch { error.value = 'Could not load the building list.'; }
  finally { loading.value = false; }
}
function selectBuilding(event) {
  router.replace({ query: { ...route.query, officeId: event.target.value || undefined } });
}
onMounted(load);
</script>
<style scoped>
.building-selector { padding: 18px; margin-top: 20px; background: var(--bg-alt, #f4f7f5); border: 1px solid var(--border, #dce4df); border-radius: 12px; }
label { display: block; font-weight: 700; margin-bottom: 10px; }
select { display: block; width: 100%; max-width: 540px; min-height: 48px; padding: 10px 12px; border: 1px solid #b8c9c0; border-radius: 8px; background: white; color: #213b32; font-size: 16px; }
p { margin: 10px 0 0; font-size: 14px; line-height: 1.5; }
</style>
