<template>
  <div class="font-selector">
    <select 
      :value="modelValue" 
      @change="handleChange"
      class="form-select"
      :class="{ 'has-selection': modelValue }"
    >
      <option :value="null">{{ placeholder || 'Select a font...' }}</option>
      <optgroup v-if="platformFonts.length > 0" label="Platform Fonts">
        <option 
          v-for="font in platformFonts" 
          :key="font.id" 
          :value="font.id"
        >
          {{ font.name }} ({{ font.family_name }})
        </option>
      </optgroup>
      <optgroup v-if="agencyFonts.length > 0" label="Agency Fonts">
        <option 
          v-for="font in agencyFonts" 
          :key="font.id" 
          :value="font.id"
        >
          {{ font.name }} ({{ font.family_name }})
        </option>
      </optgroup>
    </select>
    <button 
      v-if="modelValue && allowClear" 
      @click="clearSelection"
      class="btn btn-sm btn-danger"
      type="button"
      title="Clear font selection"
    >
      Clear
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';

const props = defineProps({
  modelValue: {
    type: Number,
    default: null
  },
  placeholder: {
    type: String,
    default: 'Select a font...'
  },
  allowClear: {
    type: Boolean,
    default: true
  },
  fontType: {
    type: String,
    default: null // 'header', 'body', 'numeric', 'display' - for filtering if needed
  }
});

const emit = defineEmits(['update:modelValue']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const fonts = ref([]);
const loading = ref(false);

const platformFonts = computed(() => {
  return fonts.value.filter(f => f.agency_id === null);
});

const agencyFonts = computed(() => {
  if (authStore.user?.role === 'super_admin') {
    return fonts.value.filter(f => f.agency_id !== null);
  } else if (authStore.user?.role === 'admin' && authStore.user?.agency_id) {
    return fonts.value.filter(f => f.agency_id === authStore.user.agency_id);
  }
  return [];
});

const fetchFonts = async () => {
  try {
    loading.value = true;
    const params = {};
    
    if (authStore.user?.role === 'admin' && authStore.user?.agency_id) {
      // Admins see their agency fonts + platform fonts
      params.agencyId = authStore.user.agency_id;
    } else if (authStore.user?.role === 'super_admin') {
      // Super admins see all fonts
      // Don't filter by agency
    }
    
    const response = await api.get('/fonts', { params });
    fonts.value = response.data || [];
  } catch (error) {
    console.error('Failed to fetch fonts:', error);
    fonts.value = [];
  } finally {
    loading.value = false;
  }
};

const handleChange = (event) => {
  const value = event.target.value === '' || event.target.value === 'null' ? null : parseInt(event.target.value);
  emit('update:modelValue', value);
};

const clearSelection = () => {
  emit('update:modelValue', null);
};

onMounted(() => {
  fetchFonts();
});
</script>

<style scoped>
.font-selector {
  display: flex;
  gap: 8px;
  align-items: center;
}

.form-select {
  flex: 1;
  min-width: 200px;
}

.has-selection {
  font-weight: 500;
}
</style>
