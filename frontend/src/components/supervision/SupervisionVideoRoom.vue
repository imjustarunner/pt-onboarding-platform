<template>
  <div class="video-room-stub">
    <div class="video-room-stub__header">
      <span class="video-room-stub__title">{{ sessionTitle || roomName || 'Video session' }}</span>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('disconnected')">Close</button>
    </div>
    <div class="video-room-stub__body">
      <div class="video-room-stub__icon">📹</div>
      <h3>Video not configured</h3>
      <p>A video provider is not set up yet. Contact your administrator to enable in-app video sessions.</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  token:        { type: String,           default: '' },
  roomName:     { type: String,           default: '' },
  sessionTitle: { type: String,           default: '' },
  sessionId:    { type: [Number, String], default: null },
  eventId:      { type: [Number, String], default: null },
  isHost:       { type: Boolean,          default: false }
});

defineEmits(['disconnected']);
</script>

<style scoped>
.video-room-stub {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 300px;
  background: #0f1117;
  border-radius: 8px;
  overflow: hidden;
  color: #fff;
}

.video-room-stub__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1d24;
  border-bottom: 1px solid #2a2d36;
}

.video-room-stub__title {
  font-weight: 600;
  font-size: 0.95rem;
}

.video-room-stub__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 24px;
  text-align: center;
}

.video-room-stub__icon {
  font-size: 3rem;
  opacity: 0.5;
}

.video-room-stub__body h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: #e0e0e0;
}

.video-room-stub__body p {
  margin: 0;
  color: #888;
  max-width: 360px;
  line-height: 1.5;
}
</style>
