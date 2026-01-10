<template>
  <div class="document-viewer">
    <div class="form-group">
      <label>Document Title</label>
      <input
        v-model="localContent.title"
        type="text"
        @input="emitUpdate"
        placeholder="Enter document title"
      />
    </div>

    <div class="form-group">
      <label>Description</label>
      <textarea
        v-model="localContent.description"
        rows="3"
        @input="emitUpdate"
        placeholder="Enter document description"
      />
    </div>

    <div class="form-group">
      <label>Document Source</label>
      <div class="source-selector">
        <select v-model="documentSource" @change="handleSourceChange" class="source-select">
          <option value="upload">Upload File</option>
          <option value="google">Google Workspace (Docs/Sheets)</option>
          <option value="url">Direct URL</option>
        </select>
      </div>
    </div>

    <!-- File Upload -->
    <div v-if="documentSource === 'upload'" class="form-group">
      <label>Document File</label>
      <div class="file-upload-area">
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          @change="handleFileSelect"
          style="display: none"
        />
        <button @click="fileInput?.click()" class="btn btn-secondary">
          {{ localContent.fileUrl ? 'Change File' : 'Upload Document' }}
        </button>
        <span v-if="localContent.fileUrl && !isGoogleWorkspace" class="file-name">
          {{ getFileName(localContent.fileUrl) }}
        </span>
      </div>
    </div>

    <!-- Google Workspace URL -->
    <div v-if="documentSource === 'google'" class="form-group">
      <label>Google Workspace Share Link *</label>
      <input
        v-model="googleWorkspaceUrl"
        type="url"
        @input="handleGoogleUrlInput"
        placeholder="Paste Google Docs, Sheets, or Slides share link"
      />
      <small class="help-text">
        Paste the share link from Google Docs, Sheets, or Slides. Make sure the file is set to "Anyone with the link can view".
      </small>
    </div>

    <!-- Direct URL -->
    <div v-if="documentSource === 'url'" class="form-group">
      <label>Document URL *</label>
      <input
        v-model="localContent.fileUrl"
        type="url"
        @input="emitUpdate"
        placeholder="Enter direct document URL"
      />
    </div>

    <div v-if="localContent.fileUrl" class="document-preview">
      <h4>Preview</h4>
      <!-- Google Workspace Embed -->
      <div v-if="isGoogleWorkspace && googleEmbedUrl" class="google-workspace-preview">
        <iframe
          :src="googleEmbedUrl"
          frameborder="0"
          style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px;"
          allow="fullscreen"
        />
        <small class="preview-note">
          Google Workspace document embedded. Make sure sharing is set to "Anyone with the link can view".
        </small>
      </div>
      <!-- PDF Preview -->
      <div v-else-if="isPdf" class="pdf-preview">
        <iframe
          :src="localContent.fileUrl"
          frameborder="0"
          style="width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 8px;"
        />
      </div>
      <!-- Image Preview -->
      <div v-else-if="isImage" class="image-preview">
        <img :src="localContent.fileUrl" alt="Document preview" style="max-width: 100%; border-radius: 8px;" />
      </div>
      <!-- Fallback Link -->
      <div v-else class="file-link">
        <a :href="localContent.fileUrl" target="_blank" class="btn btn-primary">
          Open Document
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  content: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update']);

const localContent = ref({ ...props.content });
const fileInput = ref(null);
const uploading = ref(false);
const documentSource = ref('upload');
const googleWorkspaceUrl = ref('');

// Determine initial source type
if (localContent.value.fileUrl) {
  if (isGoogleWorkspaceUrl(localContent.value.fileUrl)) {
    documentSource.value = 'google';
    googleWorkspaceUrl.value = localContent.value.fileUrl;
  } else if (localContent.value.fileUrl.startsWith('http://') || localContent.value.fileUrl.startsWith('https://')) {
    documentSource.value = 'url';
  } else {
    documentSource.value = 'upload';
  }
}

const isGoogleWorkspaceUrl = (url) => {
  if (!url) return false;
  return url.includes('docs.google.com') || 
         url.includes('drive.google.com');
};

const convertGoogleUrlToEmbed = (url) => {
  if (!url) return null;
  
  // Google Docs: https://docs.google.com/document/d/FILE_ID/edit -> https://docs.google.com/document/d/FILE_ID/preview
  // Google Sheets: https://docs.google.com/spreadsheets/d/FILE_ID/edit -> https://docs.google.com/spreadsheets/d/FILE_ID/preview
  // Google Slides: https://docs.google.com/presentation/d/FILE_ID/edit -> https://docs.google.com/presentation/d/FILE_ID/preview
  
  // Extract file ID from various Google URL formats
  const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const slideMatch = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  
  if (docMatch) {
    return `https://docs.google.com/document/d/${docMatch[1]}/preview`;
  } else if (sheetMatch) {
    return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`;
  } else if (slideMatch) {
    return `https://docs.google.com/presentation/d/${slideMatch[1]}/preview`;
  } else if (driveMatch) {
    // For Drive links, try to determine type or use generic embed
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  
  return url; // Return as-is if we can't convert
};

const isGoogleWorkspace = computed(() => {
  return isGoogleWorkspaceUrl(localContent.value.fileUrl);
});

const googleEmbedUrl = computed(() => {
  if (isGoogleWorkspace.value) {
    return convertGoogleUrlToEmbed(localContent.value.fileUrl);
  }
  return null;
});

const isPdf = computed(() => {
  return localContent.value.fileUrl?.toLowerCase().endsWith('.pdf') && !isGoogleWorkspace.value;
});

const isImage = computed(() => {
  const url = localContent.value.fileUrl?.toLowerCase() || '';
  return (url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.png')) && !isGoogleWorkspace.value;
});

const emitUpdate = () => {
  emit('update', localContent.value);
};

const handleSourceChange = () => {
  if (documentSource.value !== 'google') {
    googleWorkspaceUrl.value = '';
  }
  if (documentSource.value === 'upload') {
    localContent.value.fileUrl = '';
  }
  emitUpdate();
};

const handleGoogleUrlInput = () => {
  if (googleWorkspaceUrl.value) {
    const embedUrl = convertGoogleUrlToEmbed(googleWorkspaceUrl.value);
    localContent.value.fileUrl = embedUrl || googleWorkspaceUrl.value;
    emitUpdate();
  }
};

const handleFileSelect = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    uploading.value = true;
    const formData = new FormData();
    formData.append('file', file);

    // Upload file - adjust endpoint as needed
    const response = await api.post('/upload/document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    localContent.value.fileUrl = response.data.url || response.data.fileUrl;
    emitUpdate();
  } catch (err) {
    console.error('Failed to upload file:', err);
    alert('Failed to upload file. Please try again.');
  } finally {
    uploading.value = false;
  }
};

const getFileName = (url) => {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1];
};

watch(() => props.content, (newContent) => {
  localContent.value = { ...newContent };
  
  // Update source type if content changes
  if (localContent.value.fileUrl) {
    if (isGoogleWorkspaceUrl(localContent.value.fileUrl)) {
      documentSource.value = 'google';
      googleWorkspaceUrl.value = localContent.value.fileUrl;
    } else if (localContent.value.fileUrl.startsWith('http://') || localContent.value.fileUrl.startsWith('https://')) {
      documentSource.value = 'url';
    } else {
      documentSource.value = 'upload';
    }
  }
}, { deep: true });
</script>

<style scoped>
.document-viewer {
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
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}

.file-upload-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-name {
  color: #7f8c8d;
  font-size: 14px;
}

.document-preview {
  margin-top: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.document-preview h4 {
  margin: 0 0 12px 0;
  color: #2c3e50;
}

.source-selector {
  margin-bottom: 16px;
}

.source-select {
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
  line-height: 1.4;
}

.google-workspace-preview {
  margin-top: 12px;
}

.preview-note {
  display: block;
  margin-top: 8px;
  color: #7f8c8d;
  font-size: 12px;
  font-style: italic;
}
</style>

