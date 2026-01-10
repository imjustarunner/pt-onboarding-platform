<template>
  <div class="container">
    <h1>Training Tracks</h1>
    
    <div v-if="loading" class="loading">Loading tracks...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="tracks-grid">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="track-card"
      >
        <div class="track-header">
          <h3>{{ track.name }}</h3>
          <span v-if="track.assignment_level" class="badge badge-info">
            {{ track.assignment_level }}
          </span>
        </div>
        <p class="track-description">{{ track.description || 'No description' }}</p>
        <div class="track-footer">
          <span class="module-count">
            {{ track.modules?.length || 0 }} modules
          </span>
          <button @click="viewTrack(track.id)" class="btn btn-primary btn-sm">
            View Track
          </button>
        </div>
      </div>
    </div>
    
    <div v-if="tracks.length === 0 && !loading" class="empty-state">
      <p>No training tracks available at this time.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../services/api';

const router = useRouter();
const tracks = ref([]);
const loading = ref(true);
const error = ref('');

const fetchTracks = async () => {
  try {
    loading.value = true;
    const response = await api.get('/tracks');
    tracks.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load tracks';
  } finally {
    loading.value = false;
  }
};

const viewTrack = (trackId) => {
  router.push(`/tracks/${trackId}`);
};

onMounted(() => {
  fetchTracks();
});
</script>

<style scoped>
h1 {
  margin-bottom: 30px;
  color: #1e293b;
}

.tracks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.track-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.track-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.track-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 15px;
}

.track-header h3 {
  color: #1e293b;
  margin: 0;
  flex: 1;
}

.track-description {
  color: #64748b;
  margin-bottom: 15px;
  line-height: 1.5;
}

.track-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 15px;
  border-top: 1px solid #e2e8f0;
}

.module-count {
  font-size: 14px;
  color: #64748b;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 14px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #64748b;
}
</style>

