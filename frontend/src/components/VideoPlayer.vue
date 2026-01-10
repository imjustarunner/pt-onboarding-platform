<template>
  <div class="video-player-container">
    <div v-if="content.videoUrl" class="video-wrapper">
      <!-- YouTube/Vimeo Embed -->
      <iframe
        v-if="embedUrl"
        :src="embedUrl"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        class="video-embed"
      ></iframe>
      <!-- Direct Video File -->
      <video
        v-else
        ref="videoElement"
        :src="content.videoUrl"
        controls
        class="video-player"
        @loadedmetadata="handleVideoLoaded"
        @timeupdate="handleTimeUpdate"
      >
        Your browser does not support the video tag.
      </video>
    </div>
    <div v-else class="error">
      No video URL provided
    </div>
    <div v-if="content.title" class="video-title">
      <h3>{{ content.title }}</h3>
    </div>
    <div v-if="content.description" class="video-description">
      <p>{{ content.description }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  content: {
    type: Object,
    required: true
  }
});

const videoElement = ref(null);
let lastUpdateTime = 0;

const getVideoEmbedUrl = (url) => {
  if (!url) return null;
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return null;
};

const embedUrl = computed(() => {
  return getVideoEmbedUrl(props.content.videoUrl);
});

const handleVideoLoaded = () => {
  // Video metadata loaded
};

const handleTimeUpdate = () => {
  // Track video progress if needed
  const currentTime = Date.now();
  if (currentTime - lastUpdateTime > 10000) { // Update every 10 seconds
    lastUpdateTime = currentTime;
  }
};

onMounted(() => {
  if (videoElement.value && !embedUrl.value) {
    videoElement.value.load();
  }
});

onUnmounted(() => {
  if (videoElement.value) {
    videoElement.value.pause();
  }
});
</script>

<style scoped>
.video-player-container {
  width: 100%;
}

.video-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  border: 2px solid var(--border);
}

.video-player {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.video-embed {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.video-title {
  margin-top: 20px;
}

.video-title h3 {
  color: var(--text-primary);
  margin-bottom: 12px;
  font-weight: 700;
}

.video-description {
  color: var(--text-secondary);
  line-height: 1.7;
}
</style>

