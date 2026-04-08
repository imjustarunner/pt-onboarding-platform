<template>
  <div ref="mapEl" class="workout-route-map" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  polyline: { type: String, required: true }
});

const mapEl = ref(null);
let mapInstance = null;

const initMap = async () => {
  if (!mapEl.value || !props.polyline) return;

  // Dynamic imports so leaflet's browser globals load correctly
  const L = (await import('leaflet')).default;
  await import('leaflet/dist/leaflet.css');
  const polylineDecode = (await import('@mapbox/polyline')).decode;

  // Decode the encoded polyline → [[lat, lng], ...]
  const latlngs = polylineDecode(props.polyline);
  if (!latlngs?.length) return;

  if (mapInstance) { mapInstance.remove(); mapInstance = null; }

  mapInstance = L.map(mapEl.value, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(mapInstance);

  const route = L.polyline(latlngs, { color: '#f97316', weight: 3 }).addTo(mapInstance);
  mapInstance.fitBounds(route.getBounds(), { padding: [10, 10] });
};

onMounted(initMap);

watch(() => props.polyline, initMap);

onUnmounted(() => {
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
});
</script>

<style scoped>
.workout-route-map {
  width: 100%;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  margin-top: 8px;
}
</style>
