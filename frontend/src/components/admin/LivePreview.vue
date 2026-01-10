<template>
  <div class="live-preview">
    <div v-if="contentBlocks.length === 0" class="empty-preview">
      <p>No content to preview yet. Add content blocks to see the preview.</p>
    </div>

    <div v-else class="preview-content">
      <div
        v-for="(block, index) in contentBlocks"
        :key="block.id || index"
        class="preview-block"
      >
        <!-- Document Preview -->
        <div v-if="block.content_type === 'document'" class="document-preview-block">
          <h3 v-if="block.content_data?.title">{{ block.content_data.title }}</h3>
          <p v-if="block.content_data?.description">{{ block.content_data.description }}</p>
          <div v-if="block.content_data?.fileUrl" class="document-viewer">
            <!-- Google Workspace Embed -->
            <iframe
              v-if="isGoogleWorkspace(block.content_data.fileUrl)"
              :src="block.content_data.fileUrl"
              frameborder="0"
              style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px;"
              allow="fullscreen"
            />
            <!-- PDF -->
            <iframe
              v-else-if="isPdf(block.content_data.fileUrl)"
              :src="block.content_data.fileUrl"
              frameborder="0"
              style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 8px;"
            />
            <!-- Image -->
            <img
              v-else-if="isImage(block.content_data.fileUrl)"
              :src="block.content_data.fileUrl"
              alt="Document"
              style="max-width: 100%; border-radius: 8px;"
            />
            <!-- Fallback Link -->
            <a
              v-else
              :href="block.content_data.fileUrl"
              target="_blank"
              class="btn btn-primary"
            >
              Open Document
            </a>
          </div>
        </div>

        <!-- Video Preview -->
        <div v-else-if="block.content_type === 'video'" class="video-preview-block">
          <h3 v-if="block.content_data?.title">{{ block.content_data.title }}</h3>
          <p v-if="block.content_data?.description">{{ block.content_data.description }}</p>
          <div v-if="block.content_data?.videoUrl" class="video-wrapper">
            <video
              v-if="isDirectVideo(block.content_data.videoUrl)"
              :src="block.content_data.videoUrl"
              controls
              style="width: 100%; border-radius: 8px;"
            />
            <iframe
              v-else-if="getYoutubeEmbedUrl(block.content_data.videoUrl)"
              :src="getYoutubeEmbedUrl(block.content_data.videoUrl)"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              style="width: 100%; aspect-ratio: 16/9; border-radius: 8px;"
            />
            <iframe
              v-else-if="getVimeoEmbedUrl(block.content_data.videoUrl)"
              :src="getVimeoEmbedUrl(block.content_data.videoUrl)"
              frameborder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
              style="width: 100%; aspect-ratio: 16/9; border-radius: 8px;"
            />
          </div>
        </div>

        <!-- Rich Text Preview -->
        <div v-else-if="block.content_type === 'rich-text'" class="rich-text-preview-block">
          <div v-html="block.content_data?.content || ''"></div>
        </div>

        <!-- Quiz Preview -->
        <div v-else-if="block.content_type === 'quiz'" class="quiz-preview-block">
          <h3 v-if="block.content_data?.title">{{ block.content_data.title }}</h3>
          <p v-if="block.content_data?.description">{{ block.content_data.description }}</p>
          <div v-if="block.content_data?.questions" class="questions-preview">
            <div
              v-for="(question, qIndex) in block.content_data.questions"
              :key="qIndex"
              class="question-preview"
            >
              <p class="question-text">
                <strong>Question {{ qIndex + 1 }}:</strong> {{ question.question }}
              </p>
              <div v-if="question.type === 'multiple_choice'" class="options-preview">
                <div
                  v-for="(option, optIndex) in question.options"
                  :key="optIndex"
                  class="option-preview"
                >
                  <input type="radio" :name="`q-${qIndex}`" disabled />
                  <span>{{ typeof option === 'string' ? option : option.text || option }}</span>
                </div>
              </div>
              <div v-else-if="question.type === 'true_false'" class="options-preview">
                <div class="option-preview">
                  <input type="radio" :name="`q-${qIndex}`" disabled />
                  <span>True</span>
                </div>
                <div class="option-preview">
                  <input type="radio" :name="`q-${qIndex}`" disabled />
                  <span>False</span>
                </div>
              </div>
              <div v-else-if="question.type === 'text'" class="text-answer-preview">
                <textarea placeholder="Enter your answer" disabled rows="2"></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- Slide Preview -->
        <div v-else-if="block.content_type === 'slide'" class="slide-preview-block">
          <h3 v-if="block.content_data?.title">{{ block.content_data.title }}</h3>
          <!-- Google Slides Embed -->
          <div v-if="block.content_data?.googleSlidesUrl || block.content_data?.slidesUrl" class="google-slides-preview">
            <iframe
              :src="block.content_data.slidesUrl || convertGoogleSlidesUrl(block.content_data.googleSlidesUrl)"
              frameborder="0"
              style="width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 8px;"
              allow="fullscreen"
            />
          </div>
          <!-- HTML Slides -->
          <div v-else-if="block.content_data?.slides" class="slides-preview">
            <div
              v-for="(slide, sIndex) in block.content_data.slides"
              :key="sIndex"
              class="slide-preview"
            >
              <div v-html="slide.content"></div>
            </div>
          </div>
        </div>

        <!-- Acknowledgment Preview -->
        <div v-else-if="block.content_type === 'acknowledgment'" class="acknowledgment-preview-block">
          <h3 v-if="block.content_data?.title">{{ block.content_data.title }}</h3>
          <p v-if="block.content_data?.description">{{ block.content_data.description }}</p>
          <div v-if="block.content_data?.requiresSignature" class="signature-note">
            <p><em>Digital signature required</em></p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  contentBlocks: {
    type: Array,
    required: true
  },
  module: {
    type: Object,
    default: null
  }
});

const isGoogleWorkspace = (url) => {
  if (!url) return false;
  return url.includes('docs.google.com') || url.includes('drive.google.com');
};

const isPdf = (url) => {
  return url?.toLowerCase().endsWith('.pdf') && !isGoogleWorkspace(url);
};

const isImage = (url) => {
  const u = url?.toLowerCase() || '';
  return (u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png')) && !isGoogleWorkspace(url);
};

const isDirectVideo = (url) => {
  const u = url?.toLowerCase() || '';
  return u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.ogg');
};

const getYoutubeEmbedUrl = (url) => {
  if (!url) return null;
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
};

const getVimeoEmbedUrl = (url) => {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(\d+)/);
  if (match && match[1]) {
    return `https://player.vimeo.com/video/${match[1]}`;
  }
  return null;
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
.live-preview {
  width: 100%;
}

.empty-preview {
  padding: 40px;
  text-align: center;
  color: #7f8c8d;
}

.preview-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.preview-block {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.preview-block h3 {
  margin: 0 0 12px 0;
  color: #2c3e50;
  font-size: 20px;
}

.preview-block p {
  margin: 0 0 16px 0;
  color: #495057;
  line-height: 1.6;
}

.document-viewer,
.video-wrapper {
  margin-top: 16px;
}

.rich-text-preview-block :deep(p) {
  margin: 0 0 12px 0;
  line-height: 1.6;
}

.rich-text-preview-block :deep(ul),
.rich-text-preview-block :deep(ol) {
  padding-left: 24px;
  margin: 0 0 12px 0;
}

.rich-text-preview-block :deep(a) {
  color: #2196f3;
  text-decoration: underline;
}

.questions-preview {
  margin-top: 16px;
}

.question-preview {
  margin-bottom: 20px;
  padding: 16px;
  background: white;
  border-radius: 6px;
}

.question-text {
  margin: 0 0 12px 0;
  font-size: 16px;
}

.options-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
}

.text-answer-preview textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.signature-note {
  margin-top: 16px;
  padding: 12px;
  background: #fff3cd;
  border-radius: 6px;
  border: 1px solid #ffc107;
}
</style>

