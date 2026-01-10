<template>
  <div class="quiz-builder">
    <div class="form-group">
      <label>Quiz Title *</label>
      <input
        v-model="localContent.title"
        type="text"
        @input="emitUpdate"
        placeholder="Enter quiz title"
        required
      />
    </div>

    <div class="form-group">
      <label>Description</label>
      <textarea
        v-model="localContent.description"
        rows="2"
        @input="emitUpdate"
        placeholder="Enter quiz description"
      />
    </div>

    <div class="form-group">
      <label>Minimum Score (%)</label>
      <input
        v-model.number="localContent.minimumScore"
        type="number"
        min="0"
        max="100"
        @input="emitUpdate"
      />
    </div>

    <div class="form-group">
      <label>
        <input
          v-model="localContent.allowRetake"
          type="checkbox"
          @change="emitUpdate"
        />
        Allow Retake
      </label>
    </div>

    <div class="questions-section">
      <div class="section-header">
        <h4>Questions</h4>
        <button @click="addQuestion" class="btn btn-primary btn-sm">
          + Add Question
        </button>
      </div>

      <draggable
        v-model="localContent.questions"
        :animation="200"
        handle=".question-handle"
        @end="emitUpdate"
        item-key="id"
        tag="div"
      >
        <template #item="{ element: question, index }">
          <div class="question-item">
            <div class="question-header">
              <div class="question-handle">
                <span class="drag-icon">☰</span>
                <span class="question-number">Question {{ index + 1 }}</span>
              </div>
              <button @click="removeQuestion(index)" class="btn-icon">×</button>
            </div>

            <div class="form-group">
              <label>Question Text *</label>
              <input
                v-model="question.question"
                type="text"
                @input="emitUpdate"
                placeholder="Enter question text"
                required
              />
            </div>

            <div class="form-group">
              <label>Question Type *</label>
              <select v-model="question.type" @change="handleQuestionTypeChange(question, index)">
                <option value="multiple_choice">Multiple Choice</option>
                <option value="true_false">True/False</option>
                <option value="text">Text Answer</option>
              </select>
            </div>

            <!-- Multiple Choice -->
            <div v-if="question.type === 'multiple_choice'" class="options-section">
              <label>Answer Options (drag to reorder, first is correct)</label>
              <draggable
                v-model="question.options"
                :animation="200"
                handle=".option-handle"
                @end="emitUpdate"
                item-key="id"
                tag="div"
              >
                <template #item="{ element: option, index: optIndex }">
                  <div class="option-item">
                    <span class="option-handle">☰</span>
                    <input
                      v-model="option.text"
                      type="text"
                      @input="emitUpdate"
                      :placeholder="`Option ${optIndex + 1}`"
                    />
                    <span v-if="optIndex === 0" class="correct-badge">Correct</span>
                    <button @click="removeOption(question, optIndex)" class="btn-icon">×</button>
                  </div>
                </template>
              </draggable>
              <button @click="addOption(question)" class="btn btn-secondary btn-sm">
                + Add Option
              </button>
            </div>

            <!-- True/False -->
            <div v-if="question.type === 'true_false'" class="form-group">
              <label>Correct Answer</label>
              <select v-model="question.correctAnswer" @change="emitUpdate">
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </div>

            <!-- Text Answer -->
            <div v-if="question.type === 'text'" class="form-group">
              <label>Correct Answer *</label>
              <input
                v-model="question.correctAnswer"
                type="text"
                @input="emitUpdate"
                placeholder="Enter correct answer"
                required
              />
            </div>
          </div>
        </template>
      </draggable>

      <div v-if="!localContent.questions || localContent.questions.length === 0" class="empty-questions">
        No questions yet. Add your first question above.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { VueDraggableNext as draggable } from 'vue-draggable-next';

const props = defineProps({
  content: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update']);

const localContent = ref({
  title: '',
  description: '',
  minimumScore: 70,
  allowRetake: true,
  questions: [],
  ...props.content
});

let questionIdCounter = 0;
let optionIdCounter = 0;

const emitUpdate = () => {
  // Process questions for API format
  const processedContent = {
    ...localContent.value,
    questions: localContent.value.questions.map(q => {
      const processed = { ...q };
      if (q.type === 'multiple_choice') {
        processed.options = q.options.map(o => o.text || o);
        processed.correctAnswer = q.options[0]?.text || q.options[0];
        delete processed.id;
      }
      delete processed.id;
      return processed;
    })
  };
  emit('update', processedContent);
};

const addQuestion = () => {
  if (!localContent.value.questions) {
    localContent.value.questions = [];
  }
  localContent.value.questions.push({
    id: `q-${questionIdCounter++}`,
    question: '',
    type: 'multiple_choice',
    options: [{ id: `opt-${optionIdCounter++}`, text: '' }],
    correctAnswer: ''
  });
  emitUpdate();
};

const removeQuestion = (index) => {
  localContent.value.questions.splice(index, 1);
  emitUpdate();
};

const handleQuestionTypeChange = (question, index) => {
  if (question.type === 'multiple_choice' && (!question.options || question.options.length === 0)) {
    question.options = [{ id: `opt-${optionIdCounter++}`, text: '' }];
  }
  emitUpdate();
};

const addOption = (question) => {
  if (!question.options) {
    question.options = [];
  }
  question.options.push({ id: `opt-${optionIdCounter++}`, text: '' });
  emitUpdate();
};

const removeOption = (question, index) => {
  if (question.options.length > 1) {
    question.options.splice(index, 1);
    emitUpdate();
  }
};

watch(() => props.content, (newContent) => {
  // Initialize questions with IDs for drag-and-drop
  if (newContent.questions) {
    localContent.value = {
      ...newContent,
      questions: newContent.questions.map((q, idx) => ({
        ...q,
        id: q.id || `q-${questionIdCounter++}`,
        options: q.type === 'multiple_choice' && q.options
          ? q.options.map((opt, optIdx) => ({
              id: `opt-${optionIdCounter++}`,
              text: typeof opt === 'string' ? opt : opt.text || opt
            }))
          : q.options || []
      }))
    };
  } else {
    localContent.value = { ...newContent };
  }
}, { deep: true });
</script>

<style scoped>
.quiz-builder {
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
.form-group input[type="number"],
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}

.questions-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid #e9ecef;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h4 {
  margin: 0;
  color: #2c3e50;
}

.question-item {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #e9ecef;
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.question-handle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: grab;
}

.question-handle:active {
  cursor: grabbing;
}

.drag-icon {
  font-size: 18px;
  color: #7f8c8d;
}

.question-number {
  font-weight: 600;
  color: #2196f3;
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

.options-section {
  margin-top: 16px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: white;
  border-radius: 6px;
  margin-bottom: 8px;
  border: 1px solid #ddd;
}

.option-handle {
  cursor: grab;
  color: #7f8c8d;
  font-size: 16px;
}

.option-handle:active {
  cursor: grabbing;
}

.option-item input {
  flex: 1;
  border: none;
  padding: 4px;
  font-size: 14px;
}

.correct-badge {
  background: #d4edda;
  color: #155724;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.empty-questions {
  padding: 40px;
  text-align: center;
  color: #7f8c8d;
  background: #f8f9fa;
  border-radius: 8px;
}
</style>

