<template>
  <div class="slide-viewer-container">
    <!-- Google Slides Embed -->
    <div v-if="content.googleSlidesUrl || content.slidesUrl" class="google-slides-wrapper">
      <iframe
        :src="content.slidesUrl || convertGoogleSlidesUrl(content.googleSlidesUrl)"
        frameborder="0"
        style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px;"
        allow="fullscreen"
      />
    </div>
    
    <!-- HTML Slides -->
    <div v-else-if="content.slides && content.slides.length > 0" class="slide-wrapper">
      <div class="slide-display">
        <div class="slide-content" v-html="currentSlide.content"></div>
      </div>
      
      <div class="slide-navigation">
        <button
          @click="previousSlide"
          :disabled="currentSlideIndex === 0"
          class="btn btn-secondary"
        >
          ← Previous
        </button>
        <span class="slide-counter">
          {{ currentSlideIndex + 1 }} / {{ content.slides.length }}
        </span>
        <button
          @click="nextSlide"
          :disabled="currentSlideIndex === content.slides.length - 1"
          class="btn btn-primary"
        >
          Next →
        </button>
      </div>
    </div>
    <div v-else class="error">
      No slides available
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  content: {
    type: Object,
    required: true
  }
});

const currentSlideIndex = ref(0);

const currentSlide = computed(() => {
  if (!props.content.slides || props.content.slides.length === 0) {
    return { content: '' };
  }
  return props.content.slides[currentSlideIndex.value] || props.content.slides[0];
});

const nextSlide = () => {
  if (currentSlideIndex.value < props.content.slides.length - 1) {
    currentSlideIndex.value++;
  }
};

const previousSlide = () => {
  if (currentSlideIndex.value > 0) {
    currentSlideIndex.value--;
  }
};

const convertGoogleSlidesUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return `https://docs.google.com/presentation/d/${match[1]}/preview`;
  }
  return url;
};
</script>

<style scoped>
.slide-viewer-container {
  width: 100%;
}

.slide-wrapper {
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.slide-display {
  min-height: 500px;
  padding: 48px;
  background: var(--bg-alt);
  border: 2px solid var(--border);
  border-radius: 12px;
  margin-bottom: 24px;
  box-shadow: var(--shadow);
}

.slide-content {
  font-size: 18px;
  line-height: 1.8;
  color: var(--text-primary);
}

.slide-content :deep(h1) {
  font-size: 32px;
  margin-bottom: 20px;
  color: var(--text-primary);
  font-weight: 700;
}

.slide-content :deep(h2) {
  font-size: 24px;
  margin-bottom: 15px;
  color: var(--text-primary);
  font-weight: 700;
}

.slide-content :deep(h3) {
  font-size: 20px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-weight: 700;
}

.slide-content :deep(ul),
.slide-content :deep(ol) {
  margin-left: 30px;
  margin-bottom: 15px;
}

.slide-content :deep(li) {
  margin-bottom: 8px;
}

.slide-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: white;
  border-radius: 8px;
}

.slide-counter {
  font-weight: 600;
  color: #7f8c8d;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

