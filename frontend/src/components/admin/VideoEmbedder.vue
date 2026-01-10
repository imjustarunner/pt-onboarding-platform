<template>
  <div class="video-embedder">
    <div class="form-group">
      <label>Video Title</label>
      <input
        v-model="localContent.title"
        type="text"
        @input="emitUpdate"
        placeholder="Enter video title"
      />
    </div>

    <div class="form-group">
      <label>Description</label>
      <textarea
        v-model="localContent.description"
        rows="3"
        @input="emitUpdate"
        placeholder="Enter video description"
      />
    </div>

    <div class="form-group">
      <label>Video URL *</label>
      <input
        v-model="localContent.videoUrl"
        type="url"
        @input="emitUpdate"
        placeholder="Enter video URL (YouTube, Vimeo, or direct link)"
      />
      <small class="help-text">
        Supports YouTube, Vimeo, or direct video file URLs
      </small>
    </div>

    <div v-if="localContent.videoUrl && isValidUrl" class="video-preview">
      <h4>Preview</h4>
      <div class="video-wrapper">
        <video
          v-if="isDirectVideo"
          :src="localContent.videoUrl"
          controls
          style="width: 100%; border-radius: 8px;"
        />
        <iframe
          v-else-if="youtubeEmbedUrl"
          :src="youtubeEmbedUrl"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          style="width: 100%; aspect-ratio: 16/9; border-radius: 8px;"
        />
        <iframe
          v-else-if="vimeoEmbedUrl"
          :src="vimeoEmbedUrl"
          frameborder="0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
          style="width: 100%; aspect-ratio: 16/9; border-radius: 8px;"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  content: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update']);

const localContent = ref({ ...props.content });

const isValidUrl = computed(() => {
  try {
    new URL(localContent.value.videoUrl);
    return true;
  } catch {
    return false;
  }
});

const isDirectVideo = computed(() => {
  const url = localContent.value.videoUrl?.toLowerCase() || '';
  return url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.ogg');
});

const youtubeEmbedUrl = computed(() => {
  const url = localContent.value.videoUrl;
  if (!url) return null;
  
  // YouTube URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
  }
  
  return null;
});

const vimeoEmbedUrl = computed(() => {
  const url = localContent.value.videoUrl;
  if (!url) return null;
  
  // Vimeo URL pattern
  const match = url.match(/vimeo\.com\/(\d+)/);
  if (match && match[1]) {
    return `https://player.vimeo.com/video/${match[1]}`;
  }
  
  return null;
});

const emitUpdate = () => {
  emit('update', localContent.value);
};

watch(() => props.content, (newContent) => {
  localContent.value = { ...newContent };
}, { deep: true });
</script>

<style scoped>
.video-embedder {
  padding: 16px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.form-group input[type="text"],
.form-group input[type="url"],
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}

.help-text {
  display: block;
  margin-top: 4px;
  color: #7f8c8d;
  font-size: 12px;
}

.video-preview {
  margin-top: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.video-preview h4 {
  margin: 0 0 12px 0;
  color: #2c3e50;
}

.video-wrapper {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}
</style>

