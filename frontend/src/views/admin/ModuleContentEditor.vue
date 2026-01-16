<template>
  <div class="content-editor-page">
    <div class="editor-header">
      <div class="header-left">
        <button @click="$router.push('/admin/modules')" class="btn btn-secondary">
          ← Back to Modules
        </button>
        <div class="module-info">
          <h1>{{ module?.title || 'Loading...' }}</h1>
          <p v-if="module?.description" class="module-description">{{ module.description }}</p>
        </div>
      </div>
      <div class="header-actions">
        <button @click="saveAll" class="btn btn-primary" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save & Finish' }}
        </button>
      </div>
    </div>

    <!-- Simple Step-by-Step Editor -->
    <div class="simple-editor">
      <!-- Content List -->
      <div class="content-list-panel">
        <h3>Content Pages</h3>
        <div class="content-items">
          <div
            v-for="(item, index) in contentPages"
            :key="item.id || index"
            class="content-item"
            :class="{ active: currentPageIndex === index }"
            @click="currentPageIndex = index"
          >
            <span class="page-number">{{ index + 1 }}</span>
            <span class="page-type">{{ getPageTypeLabel(item.type) }}</span>
            <button @click.stop="deletePage(index)" class="btn-icon">×</button>
          </div>
          <button @click="showAddPageMenu = true" class="btn-add-page">
            + Add Page
          </button>
        </div>
      </div>

      <!-- Editor Area -->
      <div class="editor-area">
        <div v-if="contentPages.length === 0" class="empty-state">
          <h2>Start Building Your Content</h2>
          <p>Add your first page to get started</p>
          <button @click="showAddPageMenu = true" class="btn btn-primary">
            Add First Page
          </button>
        </div>

        <div v-else class="page-editor">
          <div class="page-header">
            <h2>Page {{ currentPageIndex + 1 }}: {{ getPageTypeLabel(currentPage.type) }}</h2>
            <div class="page-nav">
              <button 
                @click="currentPageIndex--" 
                :disabled="currentPageIndex === 0"
                class="btn btn-secondary btn-sm"
              >
                ← Previous
              </button>
              <button 
                @click="currentPageIndex++" 
                :disabled="currentPageIndex === contentPages.length - 1"
                class="btn btn-secondary btn-sm"
              >
                Next →
              </button>
            </div>
          </div>

          <!-- Intro Screen Editor -->
          <div v-if="currentPage.type === 'intro'" class="page-content">
            <div class="form-group">
              <label>Title</label>
              <input v-model="currentPage.data.title" type="text" placeholder="Enter page title" />
            </div>
            <div class="form-group">
              <label>Description/Instructions</label>
              <textarea 
                v-model="currentPage.data.description" 
                rows="5" 
                placeholder="Enter description or instructions for this page"
              ></textarea>
            </div>
          </div>

          <!-- Document Editor -->
          <div v-else-if="currentPage.type === 'document'" class="page-content">
            <div class="form-group">
              <label>Document Title</label>
              <input v-model="currentPage.data.title" type="text" placeholder="Enter document title" />
            </div>
            <div class="form-group">
              <label>Document Source</label>
              <select v-model="currentPage.data.source" @change="handleDocumentSourceChange">
                <option value="google">Google Workspace (Docs/Sheets)</option>
                <option value="text">Text Content</option>
              </select>
            </div>
            <div v-if="currentPage.data.source === 'google'" class="form-group">
              <label>Google Workspace Share Link</label>
              <input 
                v-model="currentPage.data.googleUrl" 
                type="url" 
                placeholder="Paste Google Docs/Sheets share link"
              />
              <small>Make sure the file is set to "Anyone with the link can view"</small>
            </div>
            <div v-else class="form-group">
              <label>Text Content</label>
              <textarea 
                v-model="currentPage.data.textContent" 
                rows="10" 
                placeholder="Enter your text content here"
              ></textarea>
            </div>
          </div>

          <!-- Video Editor -->
          <div v-else-if="currentPage.type === 'video'" class="page-content">
            <div class="form-group">
              <label>Video Title</label>
              <input v-model="currentPage.data.title" type="text" placeholder="Enter video title" />
            </div>
            <div class="form-group">
              <label>Video URL</label>
              <input 
                v-model="currentPage.data.videoUrl" 
                type="url" 
                placeholder="Enter YouTube, Vimeo, or video URL"
              />
              <small>Supports YouTube, Vimeo, or direct video links</small>
            </div>
            <div v-if="currentPage.data.videoUrl" class="video-preview">
              <iframe
                v-if="getVideoEmbedUrl(currentPage.data.videoUrl)"
                :src="getVideoEmbedUrl(currentPage.data.videoUrl)"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                style="width: 100%; aspect-ratio: 16/9; border-radius: 8px; border: 1px solid #ddd;"
              />
              <video
                v-else
                :src="currentPage.data.videoUrl"
                controls
                style="width: 100%; border-radius: 8px; border: 1px solid #ddd;"
              />
            </div>
          </div>

          <!-- Slides Editor -->
          <div v-else-if="currentPage.type === 'slides'" class="page-content">
            <div class="form-group">
              <label>Slides Title</label>
              <input v-model="currentPage.data.title" type="text" placeholder="Enter slides title" />
            </div>
            <div class="form-group">
              <label>Google Slides Share Link</label>
              <input 
                v-model="currentPage.data.googleSlidesUrl" 
                type="url" 
                placeholder="Paste Google Slides share link"
              />
              <small>Make sure the presentation is set to "Anyone with the link can view"</small>
            </div>
            <div v-if="currentPage.data.googleSlidesUrl" class="slides-preview">
              <iframe
                :src="convertGoogleSlidesUrl(currentPage.data.googleSlidesUrl)"
                frameborder="0"
                style="width: 100%; height: 500px; border-radius: 8px;"
                allow="fullscreen"
              />
            </div>
          </div>

          <!-- Quiz Editor -->
          <div v-else-if="currentPage.type === 'quiz'" class="page-content">
            <div class="form-group">
              <label>Quiz Title</label>
              <input v-model="currentPage.data.title" type="text" placeholder="Enter quiz title" />
            </div>
            <div class="form-group">
              <label>Quiz Description</label>
              <textarea 
                v-model="currentPage.data.description" 
                rows="3" 
                placeholder="Enter quiz description"
              ></textarea>
            </div>
            <div class="form-group">
              <label>
                <input 
                  v-model="currentPage.data.randomizeAnswers" 
                  type="checkbox"
                />
                Randomize answer order for each user
              </label>
              <small>If checked, multiple choice answers will be shuffled for each user</small>
            </div>
            <div class="form-group">
              <label>Questions</label>
              <div 
                v-for="(question, qIndex) in currentPage.data.questions" 
                :key="qIndex"
                class="question-item"
              >
                <div class="question-header">
                  <label>Question {{ qIndex + 1 }}</label>
                  <button @click="removeQuestion(qIndex)" class="btn-icon">×</button>
                </div>
                <input 
                  v-model="question.question" 
                  type="text" 
                  placeholder="Enter question"
                />
                <div class="form-group" style="margin-top: 12px;">
                  <label>Question Type</label>
                  <select v-model="question.type" @change="handleQuestionTypeChange(question, qIndex)">
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="true_false">True/False</option>
                    <option value="text">Text Answer</option>
                  </select>
                </div>
                <div v-if="question.type === 'multiple_choice'" class="options">
                  <label style="font-weight: 600; margin-bottom: 8px; display: block;">Answer Options</label>
                  <div 
                    v-for="(option, oIndex) in question.options" 
                    :key="oIndex"
                    class="option-row"
                  >
                    <input 
                      type="radio" 
                      :name="`correct-${qIndex}`"
                      :value="oIndex"
                      :checked="Number(question.correctAnswer) === oIndex"
                      @change="question.correctAnswer = oIndex"
                      style="width: auto; margin-right: 8px; cursor: pointer;"
                    />
                    <input 
                      v-model="question.options[oIndex]" 
                      type="text" 
                      placeholder="Option"
                      style="flex: 1;"
                    />
                    <span v-if="Number(question.correctAnswer) === oIndex" class="correct-badge">✓ Correct</span>
                    <button @click="removeOption(qIndex, oIndex)" class="btn-icon">×</button>
                  </div>
                  <button @click="addOption(qIndex)" class="btn btn-sm">+ Add Option</button>
                </div>
                <div v-else-if="question.type === 'true_false'" class="form-group" style="margin-top: 12px;">
                  <label>Correct Answer</label>
                  <select v-model="question.correctAnswer">
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>
                <div v-else-if="question.type === 'text'" class="form-group" style="margin-top: 12px;">
                  <label>Correct Answer (for grading)</label>
                  <input 
                    v-model="question.correctAnswer" 
                    type="text" 
                    placeholder="Enter correct answer"
                  />
                  <small>This will be used to automatically grade text responses</small>
                </div>
              </div>
              <button @click="addQuestion" class="btn btn-secondary">+ Add Question</button>
            </div>
          </div>

          <!-- Custom Form (User Info) Editor -->
          <div v-else-if="currentPage.type === 'form'" class="page-content">
            <div class="form-group">
              <label>Category (optional)</label>
              <select v-model="currentPage.data.categoryKey">
                <option value="">No category</option>
                <option v-for="cat in availableCategories" :key="cat.id" :value="cat.category_key">
                  {{ cat.category_label }}{{ cat.agency_id ? '' : ' (Platform)' }}
                </option>
              </select>
              <small>Used for organizing the collected info into profile tabs/sections.</small>
            </div>

            <div class="form-group">
              <label style="display:flex; align-items:center; gap:8px;">
                <input v-model="currentPage.data.requireAll" type="checkbox" />
                Require all selected fields to complete this module
              </label>
            </div>

            <div class="form-group">
              <label>Create a new category</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <input v-model="newCategoryLabel" type="text" placeholder="Category label (e.g., Clinical Info)" />
                <input v-model="newCategoryKey" type="text" placeholder="Optional key (e.g., clinical_info)" />
                <button class="btn btn-secondary btn-sm" :disabled="creatingCategory || !newCategoryLabel" @click="createCategoryFromEditor">
                  {{ creatingCategory ? 'Creating...' : 'Create' }}
                </button>
              </div>
              <small>If you leave key blank, it will be auto-generated.</small>
            </div>

            <div class="form-group">
              <label>Pick fields</label>
              <input v-model="formFieldSearch" type="text" placeholder="Search fields..." style="margin-bottom: 8px;" />
              <div class="field-picker">
                <label
                  v-for="field in filteredAvailableFields"
                  :key="field.id"
                  class="field-picker-item"
                >
                  <input
                    type="checkbox"
                    :value="field.id"
                    v-model="currentPage.data.fieldDefinitionIds"
                  />
                  <span style="font-weight: 600;">{{ field.field_label }}</span>
                  <span style="opacity: 0.75; margin-left: 6px;">({{ field.field_key }})</span>
                  <span v-if="field.agency_id" class="prop-badge" style="margin-left: 8px;">Agency</span>
                  <span v-else class="prop-badge" style="margin-left: 8px;">Platform</span>
                  <span v-if="field.is_required" class="prop-badge required" style="margin-left: 6px;">Required</span>
                </label>
              </div>
            </div>

            <div class="form-group" v-if="currentPage.data.fieldDefinitionIds && currentPage.data.fieldDefinitionIds.length">
              <label>Selected fields (order)</label>
              <div class="selected-fields">
                <div v-for="(fid, idx) in currentPage.data.fieldDefinitionIds" :key="fid" class="selected-field-row">
                  <span>{{ idx + 1 }}. {{ getFieldLabelById(fid) }}</span>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-secondary btn-sm" :disabled="idx === 0" @click="moveSelectedField(-1, fid)">↑</button>
                    <button class="btn btn-secondary btn-sm" :disabled="idx === currentPage.data.fieldDefinitionIds.length - 1" @click="moveSelectedField(1, fid)">↓</button>
                    <button class="btn btn-danger btn-sm" @click="removeSelectedField(fid)">Remove</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Response Editor -->
          <div v-else-if="currentPage.type === 'response'" class="page-content">
            <div class="form-group">
              <label>Prompt/Question</label>
              <input v-model="currentPage.data.prompt" type="text" placeholder="Enter prompt or question" />
            </div>
            <div class="form-group">
              <label>Response Type</label>
              <select v-model="currentPage.data.responseType">
                <option value="text">Text Response</option>
                <option value="textarea">Long Text Response</option>
              </select>
            </div>
          </div>

          <!-- Google Form Editor -->
          <div v-else-if="currentPage.type === 'google-form'" class="page-content">
            <div class="form-group">
              <label>Google Form Title</label>
              <input v-model="currentPage.data.title" type="text" placeholder="Enter form title" />
            </div>
            <div class="form-group">
              <label>Google Form Embed URL</label>
              <input 
                v-model="currentPage.data.formUrl" 
                type="url" 
                placeholder="Paste Google Form embed URL"
              />
              <small>Get the embed URL from Google Forms → Send → Embed HTML</small>
            </div>
          </div>

          <!-- Add Next Page Button -->
          <div class="page-actions">
            <button @click="openPreview" class="btn btn-secondary">
              👁️ Quick Preview
            </button>
            <button @click="showAddPageMenu = true" class="btn btn-primary">
              + Add Next Page
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
    <div v-if="showPreviewModal" class="modal-overlay" @click="showPreviewModal = false">
      <div class="modal-content preview-modal" @click.stop>
        <div class="preview-header">
          <h2>Page Preview: {{ getPageTypeLabel(currentPage?.type) }}</h2>
          <button @click="showPreviewModal = false" class="btn-icon">×</button>
        </div>
        <div class="preview-body">
          <div v-if="!currentPage" class="preview-empty">
            <p style="text-align: center; color: #999; padding: 40px;">No page selected for preview. Please select a page from the sidebar.</p>
          </div>
          <!-- Intro Preview -->
          <div v-else-if="currentPage?.type === 'intro'" class="preview-intro">
            <h2>{{ currentPage.data.title || 'Intro Title' }}</h2>
            <div v-if="currentPage.data.description" class="preview-description" v-html="formatDescription(currentPage.data.description)"></div>
            <p v-else style="color: #999; font-style: italic;">No description provided</p>
          </div>

          <!-- Document Preview -->
          <div v-else-if="currentPage?.type === 'document'" class="preview-document">
            <h3>{{ currentPage.data.title || 'Document Title' }}</h3>
            <p v-if="currentPage.data.description">{{ currentPage.data.description }}</p>
            <div v-if="currentPage.data.source === 'google' && currentPage.data.googleUrl" class="preview-embed">
              <iframe
                :src="convertGoogleUrlToEmbed(currentPage.data.googleUrl)"
                frameborder="0"
                style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 8px;"
                allow="fullscreen"
              />
            </div>
            <div v-else-if="currentPage.data.textContent" class="preview-text">
              <p style="white-space: pre-wrap;">{{ currentPage.data.textContent }}</p>
            </div>
            <p v-else style="color: #999; font-style: italic;">No content provided</p>
          </div>

          <!-- Video Preview -->
          <div v-else-if="currentPage?.type === 'video'" class="preview-video">
            <h3>{{ currentPage.data.title || 'Video Title' }}</h3>
            <p v-if="currentPage.data.description">{{ currentPage.data.description }}</p>
            <div v-if="currentPage.data.videoUrl" class="preview-embed">
              <iframe
                v-if="getVideoEmbedUrl(currentPage.data.videoUrl)"
                :src="getVideoEmbedUrl(currentPage.data.videoUrl)"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                style="width: 100%; aspect-ratio: 16/9; border-radius: 8px;"
              />
              <video
                v-else
                :src="currentPage.data.videoUrl"
                controls
                style="width: 100%; border-radius: 8px;"
              />
            </div>
            <p v-else style="color: #999; font-style: italic;">No video URL provided</p>
          </div>

          <!-- Slides Preview -->
          <div v-else-if="currentPage?.type === 'slides'" class="preview-slides">
            <h3>{{ currentPage.data.title || 'Slides Title' }}</h3>
            <div v-if="currentPage.data.googleSlidesUrl" class="preview-embed">
              <iframe
                :src="convertGoogleSlidesUrl(currentPage.data.googleSlidesUrl)"
                frameborder="0"
                style="width: 100%; height: 400px; border-radius: 8px;"
                allow="fullscreen"
              />
            </div>
            <p v-else style="color: #999; font-style: italic;">No Google Slides URL provided</p>
          </div>

          <!-- Quiz Preview -->
          <div v-else-if="currentPage?.type === 'quiz'" class="preview-quiz">
            <h3>{{ currentPage.data.title || 'Quiz Title' }}</h3>
            <p v-if="currentPage.data.description">{{ currentPage.data.description }}</p>
            <div v-if="currentPage.data.questions && currentPage.data.questions.length > 0" class="preview-questions">
              <div v-for="(question, qIndex) in currentPage.data.questions" :key="qIndex" class="preview-question">
                <p><strong>Question {{ qIndex + 1 }}:</strong> {{ question.question || 'No question text' }}</p>
                <div v-if="question.type === 'multiple_choice' && question.options">
                  <div v-for="(option, oIndex) in question.options" :key="oIndex" class="preview-option">
                    <input type="radio" :name="`preview-q-${qIndex}`" disabled />
                    <span>{{ (typeof option === 'object' ? option.text : option) || 'Empty option' }}</span>
                    <span v-if="Number(question.correctAnswer) === oIndex" class="correct-badge">✓</span>
                  </div>
                </div>
                <div v-else-if="question.type === 'true_false'">
                  <div class="preview-option">
                    <input type="radio" :name="`preview-q-${qIndex}`" disabled />
                    <span>True</span>
                    <span v-if="question.correctAnswer === 'true'" class="correct-badge">✓</span>
                  </div>
                  <div class="preview-option">
                    <input type="radio" :name="`preview-q-${qIndex}`" disabled />
                    <span>False</span>
                    <span v-if="question.correctAnswer === 'false'" class="correct-badge">✓</span>
                  </div>
                </div>
                <div v-else-if="question.type === 'text'">
                  <textarea placeholder="Text answer" disabled rows="2" style="width: 100%;"></textarea>
                  <small v-if="question.correctAnswer">Correct answer: {{ question.correctAnswer }}</small>
                </div>
              </div>
            </div>
            <p v-else style="color: #999; font-style: italic;">No questions added yet</p>
          </div>

          <!-- Custom Form Preview -->
          <div v-else-if="currentPage?.type === 'form'" class="preview-form">
            <h3>Form</h3>
            <p v-if="currentPage.data.categoryKey">
              <strong>Category:</strong> {{ currentPage.data.categoryKey }}
            </p>
            <p v-else style="color: #999; font-style: italic;">No category selected</p>
            <p>
              <strong>Require all:</strong> {{ currentPage.data.requireAll ? 'Yes' : 'No' }}
            </p>
            <div v-if="currentPage.data.fieldDefinitionIds && currentPage.data.fieldDefinitionIds.length">
              <p><strong>Fields:</strong></p>
              <ul style="margin: 0; padding-left: 18px;">
                <li v-for="fid in currentPage.data.fieldDefinitionIds" :key="fid">
                  {{ getFieldLabelById(fid) }}
                </li>
              </ul>
            </div>
            <p v-else style="color: #999; font-style: italic;">No fields selected</p>
          </div>

          <!-- Response Preview -->
          <div v-else-if="currentPage?.type === 'response'" class="preview-response">
            <h3>{{ currentPage.data.prompt || 'Response Prompt' }}</h3>
            <div v-if="currentPage.data.responseType === 'textarea'">
              <textarea placeholder="User will enter response here..." disabled rows="6" style="width: 100%;"></textarea>
            </div>
            <div v-else>
              <input type="text" placeholder="User will enter response here..." disabled style="width: 100%;" />
            </div>
          </div>

          <!-- Google Form Preview -->
          <div v-else-if="currentPage?.type === 'google-form'" class="preview-form">
            <h3>{{ currentPage.data.title || 'Google Form Title' }}</h3>
            <div v-if="currentPage.data.formUrl" class="preview-embed">
              <iframe
                :src="currentPage.data.formUrl"
                frameborder="0"
                style="width: 100%; height: 400px; border-radius: 8px;"
              ></iframe>
            </div>
            <p v-else style="color: #999; font-style: italic;">No Google Form URL provided</p>
          </div>
        </div>
        <div class="preview-footer">
          <button @click="showPreviewModal = false" class="btn btn-primary">Close</button>
        </div>
      </div>
    </div>

    <!-- Add Page Menu -->
    <div v-if="showAddPageMenu" class="modal-overlay" @click="showAddPageMenu = false">
      <div class="modal-content" @click.stop>
        <h2>Add New Page</h2>
        <div class="page-type-options">
          <button @click="addPage('intro')" class="page-type-btn">
            <span class="icon">📋</span>
            <span class="label">Intro Screen</span>
          </button>
          <button @click="addPage('document')" class="page-type-btn">
            <span class="icon">📄</span>
            <span class="label">Document</span>
          </button>
          <button @click="addPage('video')" class="page-type-btn">
            <span class="icon">🎥</span>
            <span class="label">Video</span>
          </button>
          <button @click="addPage('slides')" class="page-type-btn">
            <span class="icon">📊</span>
            <span class="label">Google Slides</span>
          </button>
          <button @click="addPage('quiz')" class="page-type-btn">
            <span class="icon">❓</span>
            <span class="label">Quiz</span>
          </button>
          <button @click="addPage('form')" class="page-type-btn">
            <span class="icon">🧩</span>
            <span class="label">Form (User Info)</span>
          </button>
          <button @click="addPage('response')" class="page-type-btn">
            <span class="icon">✍️</span>
            <span class="label">Response</span>
          </button>
          <button @click="addPage('google-form')" class="page-type-btn">
            <span class="icon">📝</span>
            <span class="label">Google Form</span>
          </button>
        </div>
        <button @click="showAddPageMenu = false" class="btn btn-secondary">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();

const module = ref(null);
const contentPages = ref([]);
const currentPageIndex = ref(0);
const showAddPageMenu = ref(false);
const showPreviewModal = ref(false);
const saving = ref(false);
const loading = ref(true);

// Form-module builder data (user info categories + fields)
const userInfoCategories = ref([]);
const userInfoFields = ref([]);
const formFieldSearch = ref('');
const newCategoryLabel = ref('');
const newCategoryKey = ref('');
const creatingCategory = ref(false);

const currentPage = computed(() => {
  return contentPages.value[currentPageIndex.value] || null;
});

const availableCategories = computed(() => {
  const agencyId = module.value?.agency_id || null;
  return (userInfoCategories.value || []).filter((c) => c.agency_id === null || c.agency_id === agencyId);
});

const availableFields = computed(() => {
  const agencyId = module.value?.agency_id || null;
  return (userInfoFields.value || []).filter((f) => f.agency_id === null || f.agency_id === agencyId);
});

const filteredAvailableFields = computed(() => {
  const q = String(formFieldSearch.value || '').trim().toLowerCase();
  if (!q) return availableFields.value;
  return availableFields.value.filter((f) => {
    return (
      String(f.field_label || '').toLowerCase().includes(q) ||
      String(f.field_key || '').toLowerCase().includes(q)
    );
  });
});

const getFieldLabelById = (id) => {
  const field = (availableFields.value || []).find((f) => f.id === id);
  return field?.field_label || `Field #${id}`;
};

const fetchModule = async () => {
  try {
    const moduleId = route.params.id;
    if (!moduleId || moduleId === 'undefined' || moduleId === 'null') {
      console.warn('No valid module ID in route');
      module.value = { id: null, title: 'New Module', description: '' };
      return;
    }
    const response = await api.get(`/modules/${moduleId}`);
    module.value = response.data;
  } catch (err) {
    // Handle 404 (module doesn't exist yet) gracefully - this is expected for new modules
    if (err.response?.status === 404) {
      console.log('Module not found yet (this is normal for new modules)');
      module.value = { id: route.params.id, title: 'New Module', description: '' };
      return;
    }
    // For other errors, log but don't show alert - allow user to continue editing
    console.error('Failed to load module:', err);
    // Set a default module object so the UI doesn't break
    module.value = { id: route.params.id, title: 'Module', description: '' };
  }
};

const fetchContent = async () => {
  try {
    loading.value = true;
    const moduleId = route.params.id;
    
    // If no valid module ID, skip fetching content (user is creating new content)
    if (!moduleId || moduleId === 'undefined' || moduleId === 'null') {
      contentPages.value = [];
      if (contentPages.value.length === 0) {
        addPage('intro');
      }
      return;
    }
    
    const response = await api.get(`/modules/${moduleId}/content`);
    
    // Convert backend content to simple page format
    contentPages.value = response.data.map((item, index) => {
      const data = typeof item.content_data === 'string' 
        ? JSON.parse(item.content_data) 
        : item.content_data;
      
      // Determine page type from content_type and data
      let pageType = 'intro';
      if (item.content_type === 'video') {
        pageType = 'video';
      } else if (item.content_type === 'slide') {
        pageType = 'slides';
      } else if (item.content_type === 'quiz') {
        pageType = 'quiz';
      } else if (item.content_type === 'form') {
        pageType = 'form';
      } else if (item.content_type === 'text') {
        if (data.googleUrl || data.googleSlidesUrl) {
          pageType = data.googleSlidesUrl ? 'slides' : 'document';
        } else if (data.textContent) {
          pageType = 'document';
        } else if (data.prompt) {
          pageType = 'response';
        } else {
          pageType = 'intro';
        }
      }
      
      return {
        id: item.id,
        type: pageType,
        data: {
          title: data.title || '',
          description: data.description || '',
          videoUrl: data.videoUrl || '',
          googleUrl: data.googleUrl || data.fileUrl || '',
          googleSlidesUrl: data.googleSlidesUrl || '',
          textContent: data.textContent || data.content || '',
          prompt: data.prompt || '',
          responseType: data.responseType || 'text',
          categoryKey: data.categoryKey || '',
          fieldDefinitionIds: Array.isArray(data.fieldDefinitionIds) ? data.fieldDefinitionIds : [],
          requireAll: data.requireAll === true,
          questions: (data.questions || []).map(q => ({
            ...q,
            correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : (q.type === 'multiple_choice' ? 0 : (q.type === 'true_false' ? 'true' : '')),
            options: q.options || []
          })),
          randomizeAnswers: data.randomizeAnswers || false,
          formUrl: data.formUrl || '',
          source: data.googleUrl ? 'google' : 'text'
        }
      };
    });
    
    if (contentPages.value.length === 0) {
      // Add default intro page
      addPage('intro');
    }
  } catch (err) {
    console.error('Failed to load content:', err);
  } finally {
    loading.value = false;
  }
};

const addPage = (type) => {
  const defaultData = {
    intro: { title: '', description: '' },
    document: { title: '', source: 'google', googleUrl: '', textContent: '' },
    video: { title: '', videoUrl: '' },
    slides: { title: '', googleSlidesUrl: '' },
    quiz: { title: '', description: '', questions: [], randomizeAnswers: false },
    response: { prompt: '', responseType: 'text' },
    form: { categoryKey: '', fieldDefinitionIds: [], requireAll: true },
    'google-form': { title: '', formUrl: '' }
  };
  
  contentPages.value.push({
    id: null,
    type: type,
    data: { ...defaultData[type] }
  });
  
  currentPageIndex.value = contentPages.value.length - 1;
  showAddPageMenu.value = false;
};

const deletePage = async (index) => {
  if (!confirm('Are you sure you want to delete this page?')) return;
  
  const page = contentPages.value[index];
  if (page.id) {
    try {
      await api.delete(`/modules/${route.params.id}/content/${page.id}`);
    } catch (err) {
      console.error('Failed to delete page:', err);
    }
  }
  
  contentPages.value.splice(index, 1);
  if (currentPageIndex.value >= contentPages.value.length) {
    currentPageIndex.value = Math.max(0, contentPages.value.length - 1);
  }
};

const handleDocumentSourceChange = () => {
  // Reset fields when source changes
  if (currentPage.value.data.source === 'google') {
    currentPage.value.data.textContent = '';
  } else {
    currentPage.value.data.googleUrl = '';
  }
};

const addQuestion = () => {
  if (!currentPage.value.data.questions) {
    currentPage.value.data.questions = [];
  }
  currentPage.value.data.questions.push({
    question: '',
    type: 'multiple_choice',
    options: ['', ''],
    correctAnswer: 0 // First option is correct by default
  });
};

const handleQuestionTypeChange = (question, qIndex) => {
  if (question.type === 'multiple_choice') {
    if (!question.options || question.options.length === 0) {
      question.options = ['', ''];
    }
    question.correctAnswer = 0; // Default to first option
  } else if (question.type === 'true_false') {
    question.correctAnswer = 'true';
  } else if (question.type === 'text') {
    question.correctAnswer = '';
  }
};

const removeQuestion = (index) => {
  currentPage.value.data.questions.splice(index, 1);
};

const addOption = (questionIndex) => {
  currentPage.value.data.questions[questionIndex].options.push('');
};

const removeOption = (questionIndex, optionIndex) => {
  const question = currentPage.value.data.questions[questionIndex];
  question.options.splice(optionIndex, 1);
  
  // Adjust correctAnswer if the removed option was before or at the correct answer
  if (question.type === 'multiple_choice' && typeof question.correctAnswer === 'number') {
    if (optionIndex < question.correctAnswer) {
      question.correctAnswer = question.correctAnswer - 1;
    } else if (optionIndex === question.correctAnswer) {
      // If we removed the correct answer, default to first option
      question.correctAnswer = 0;
    }
  }
};

const getPageTypeLabel = (type) => {
  const labels = {
    intro: 'Intro Screen',
    document: 'Document',
    video: 'Video',
    slides: 'Slides',
    quiz: 'Quiz',
    form: 'Form',
    response: 'Response',
    'google-form': 'Google Form'
  };
  return labels[type] || type;
};

const moveSelectedField = (direction, fieldId) => {
  if (!currentPage.value || currentPage.value.type !== 'form') return;
  const arr = currentPage.value.data.fieldDefinitionIds || [];
  const idx = arr.indexOf(fieldId);
  if (idx === -1) return;
  const next = idx + direction;
  if (next < 0 || next >= arr.length) return;
  const copy = [...arr];
  const tmp = copy[idx];
  copy[idx] = copy[next];
  copy[next] = tmp;
  currentPage.value.data.fieldDefinitionIds = copy;
};

const removeSelectedField = (fieldId) => {
  if (!currentPage.value || currentPage.value.type !== 'form') return;
  currentPage.value.data.fieldDefinitionIds = (currentPage.value.data.fieldDefinitionIds || []).filter(
    (id) => id !== fieldId
  );
};

const fetchFormBuilderData = async () => {
  try {
    const [catsRes, fieldsRes] = await Promise.all([
      api.get('/user-info-categories'),
      api.get('/user-info-fields')
    ]);
    userInfoCategories.value = catsRes.data || [];
    userInfoFields.value = fieldsRes.data || [];
  } catch (err) {
    console.error('Failed to load form builder data:', err);
  }
};

const createCategoryFromEditor = async () => {
  try {
    if (!newCategoryLabel.value) return;
    creatingCategory.value = true;
    const payload = {
      categoryLabel: newCategoryLabel.value,
      categoryKey: newCategoryKey.value || undefined,
      agencyId: module.value?.agency_id || undefined
    };
    const res = await api.post('/user-info-categories', payload);
    userInfoCategories.value = [...(userInfoCategories.value || []), res.data];
    // Select it for the current form page
    if (currentPage.value?.type === 'form') {
      currentPage.value.data.categoryKey = res.data.category_key;
    }
    newCategoryLabel.value = '';
    newCategoryKey.value = '';
  } catch (err) {
    console.error('Failed to create category:', err);
    alert(err?.response?.data?.error?.message || 'Failed to create category');
  } finally {
    creatingCategory.value = false;
  }
};

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

const convertGoogleSlidesUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return `https://docs.google.com/presentation/d/${match[1]}/preview`;
  }
  return url;
};

const saveAll = async () => {
  try {
    saving.value = true;
    const moduleId = route.params.id;
    
    // Save all pages
    for (let i = 0; i < contentPages.value.length; i++) {
      const page = contentPages.value[i];
      const backendData = convertPageToBackend(page);
      
      if (page.id) {
        // Update existing
        await api.put(`/modules/${moduleId}/content/${page.id}`, {
          contentType: backendData.contentType,
          contentData: backendData.contentData,
          orderIndex: i
        });
      } else {
        // Create new
        const response = await api.post(`/modules/${moduleId}/content`, {
          contentType: backendData.contentType,
          contentData: backendData.contentData,
          orderIndex: i
        });
        page.id = response.data.id;
      }
    }
    
    alert('Content saved successfully!');
    router.push('/admin/modules');
  } catch (err) {
    console.error('Failed to save:', err);
    alert('Failed to save content. Please try again.');
  } finally {
    saving.value = false;
  }
};

const convertPageToBackend = (page) => {
  let contentType = 'text';
  let contentData = {};
  
  switch (page.type) {
    case 'intro':
      contentData = {
        title: page.data.title,
        description: page.data.description
      };
      break;
    case 'document':
      if (page.data.source === 'google') {
        contentData = {
          title: page.data.title,
          fileUrl: convertGoogleUrlToEmbed(page.data.googleUrl),
          googleUrl: page.data.googleUrl
        };
      } else {
        contentData = {
          title: page.data.title,
          content: page.data.textContent
        };
      }
      break;
    case 'video':
      contentType = 'video';
      contentData = {
        title: page.data.title,
        videoUrl: page.data.videoUrl
      };
      break;
    case 'slides':
      contentType = 'slide';
      contentData = {
        title: page.data.title,
        googleSlidesUrl: page.data.googleSlidesUrl,
        slidesUrl: convertGoogleSlidesUrl(page.data.googleSlidesUrl)
      };
      break;
    case 'quiz':
      contentType = 'quiz';
      contentData = {
        title: page.data.title,
        description: page.data.description,
        questions: page.data.questions,
        randomizeAnswers: page.data.randomizeAnswers || false
      };
      break;
    case 'form':
      contentType = 'form';
      contentData = {
        categoryKey: page.data.categoryKey || null,
        fieldDefinitionIds: Array.isArray(page.data.fieldDefinitionIds) ? page.data.fieldDefinitionIds : [],
        requireAll: page.data.requireAll === true
      };
      break;
    case 'response':
      contentData = {
        prompt: page.data.prompt,
        responseType: page.data.responseType
      };
      break;
    case 'google-form':
      contentData = {
        title: page.data.title,
        formUrl: page.data.formUrl
      };
      break;
  }
  
  return { contentType, contentData };
};

const convertGoogleUrlToEmbed = (url) => {
  if (!url) return null;
  const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (docMatch) {
    return `https://docs.google.com/document/d/${docMatch[1]}/preview`;
  } else if (sheetMatch) {
    return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`;
  }
  return url;
};

const formatDescription = (text) => {
  if (!text) return '';
  // Convert line breaks to <br> tags
  return text.replace(/\n/g, '<br>');
};

const openPreview = () => {
  console.log('Opening preview modal');
  console.log('Current page:', currentPage.value);
  console.log('Content pages:', contentPages.value);
  console.log('Current page index:', currentPageIndex.value);
  showPreviewModal.value = true;
};

onMounted(async () => {
  await fetchModule();
  await fetchContent();
  await fetchFormBuilderData();
});
</script>

<style scoped>
.content-editor-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 20px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-left {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex: 1;
}

.module-info h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #2c3e50;
}

.module-description {
  margin: 0;
  color: #7f8c8d;
  font-size: 14px;
}

.simple-editor {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 20px;
}

.content-list-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  height: fit-content;
  position: sticky;
  top: 20px;
}

.content-list-panel h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #2c3e50;
}

.content-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.content-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid #e9ecef;
  transition: all 0.2s;
}

.content-item:hover {
  background: #f8f9fa;
}

.content-item.active {
  background: #e3f2fd;
  border-color: #2196f3;
}

.page-number {
  font-weight: 600;
  color: #2196f3;
  min-width: 24px;
}

.page-type {
  flex: 1;
  font-size: 13px;
  color: #495057;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 20px;
  color: #dc3545;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-add-page {
  width: 100%;
  padding: 12px;
  background: #f8f9fa;
  border: 2px dashed #ddd;
  border-radius: 6px;
  cursor: pointer;
  color: #495057;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-add-page:hover {
  background: #e9ecef;
  border-color: #2196f3;
  color: #2196f3;
}

.editor-area {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  min-height: 600px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #7f8c8d;
}

.empty-state h2 {
  margin: 0 0 12px 0;
  color: #2c3e50;
}

.page-editor {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid #e9ecef;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #2c3e50;
}

.page-nav {
  display: flex;
  gap: 8px;
}

.page-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.form-group input,
.form-group textarea,
.form-group select {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}

.form-group small {
  color: #7f8c8d;
  font-size: 12px;
}

.question-item {
  padding: 16px;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  margin-bottom: 16px;
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.options {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-row input[type="text"] {
  flex: 1;
}

.option-row input[type="radio"] {
  width: auto;
  margin-right: 8px;
}

.correct-badge {
  background: #28a745;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.page-actions {
  padding-top: 24px;
  border-top: 1px solid #e9ecef;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content h2 {
  margin: 0 0 20px 0;
  color: #2c3e50;
}

.page-type-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.page-type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.page-type-btn:hover {
  border-color: #2196f3;
  background: #f8f9fa;
}

.page-type-btn .icon {
  font-size: 32px;
}

.page-type-btn .label {
  font-weight: 500;
  color: #2c3e50;
}

.video-preview,
.slides-preview {
  margin-top: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.preview-modal {
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid #e9ecef;
  margin-bottom: 20px;
}

.preview-header h2 {
  margin: 0;
  font-size: 20px;
  color: #2c3e50;
}

.preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 0;
}

.preview-footer {
  padding-top: 16px;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
}

.preview-intro h2 {
  font-size: 28px;
  color: #2c3e50;
  margin-bottom: 16px;
}

.preview-description {
  font-size: 16px;
  line-height: 1.7;
  color: #495057;
}

.preview-embed {
  margin-top: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.preview-questions {
  margin-top: 20px;
}

.preview-question {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 16px;
}

.preview-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.preview-response h3 {
  margin-bottom: 16px;
  color: #2c3e50;
}

.field-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: #fafbfc;
}

.field-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: white;
  border: 1px solid #e9ecef;
}

.selected-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.selected-field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: #fff;
}
</style>
