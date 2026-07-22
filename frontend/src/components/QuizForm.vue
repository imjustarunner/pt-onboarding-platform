<template>
  <div class="quiz-container">
    <div v-if="content.title" class="quiz-header">
      <h3>{{ content.title }}</h3>
      <p v-if="content.description">{{ content.description }}</p>
    </div>
    
    <div v-if="submitted && lastScore !== null" class="quiz-result">
      <div :class="['result-badge', passed ? 'passed' : 'failed']">
        {{ passed ? '✓ Passed' : '✗ Failed' }}
      </div>
      <p class="score">Your Score: {{ lastScore }}%</p>
      <p v-if="content.minimumScore != null || minimumScore != null" class="minimum-score">
        Minimum Required: {{ minimumScore ?? content.minimumScore }}%
      </p>
      <p v-if="attemptCount != null" class="attempt-meta">
        Attempt {{ attemptCount }}<span v-if="maxAttempts"> of {{ maxAttempts }}</span>
      </p>
      <div v-if="!passed && remediation.length" class="remediation-panel">
        <h4>Review these topics before retrying</h4>
        <div v-for="item in remediation" :key="item.questionIndex" class="remediation-item">
          <p class="remediation-q">{{ item.question }}</p>
          <p v-if="item.explanation" class="remediation-explain">{{ item.explanation }}</p>
          <div v-if="item.remediationHtml" class="remediation-html" v-html="item.remediationHtml" />
        </div>
      </div>
      <button v-if="!passed && canRetake" @click="resetQuiz" class="btn btn-primary">
        Retake Quiz
      </button>
      <p v-else-if="!passed && !canRetake" class="muted">No retakes remaining for this quiz.</p>
    </div>
    
    <div v-else-if="disabled" class="quiz-disabled">
      <p>This quiz has been completed. You cannot retake it.</p>
    </div>
    <form v-else @submit.prevent="submitQuiz" class="quiz-form">
      <div
        v-for="(question, index) in displayQuestions"
        :key="index"
        class="question-item"
      >
        <div class="question-header">
          <span class="question-number">Question {{ index + 1 }}</span>
          <span class="question-type">{{ getQuestionTypeLabel(question.type) }}</span>
        </div>
        <p class="question-text">{{ question.question }}</p>
        
        <div v-if="question.type === 'multiple_choice'" class="options">
          <label
            v-for="(option, optIndex) in question.options"
            :key="optIndex"
            class="option-label"
          >
            <input
              type="radio"
              :name="`question-${index}`"
              :value="optionDisplayText(option)"
              v-model="answers[index]"
              required
            />
            <span>{{ optionDisplayText(option) }}</span>
          </label>
        </div>
        
        <div v-else-if="question.type === 'true_false'" class="options">
          <label class="option-label">
            <input
              type="radio"
              :name="`question-${index}`"
              value="true"
              v-model="answers[index]"
              required
            />
            <span>True</span>
          </label>
          <label class="option-label">
            <input
              type="radio"
              :name="`question-${index}`"
              value="false"
              v-model="answers[index]"
              required
            />
            <span>False</span>
          </label>
        </div>
        
        <div v-else-if="question.type === 'text'" class="text-answer">
          <textarea
            v-model="answers[index]"
            :placeholder="question.placeholder || 'Enter your answer'"
            required
            rows="3"
          ></textarea>
        </div>
      </div>
      
      <button type="submit" class="btn btn-primary" :disabled="submitting">
        {{ submitting ? 'Submitting...' : 'Submit Quiz' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../services/api';
import { optionDisplayText } from '../utils/trainingContentNormalize.js';

const props = defineProps({
  moduleId: {
    type: [String, Number],
    required: true
  },
  content: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['quiz-completed']);

const answers = ref([]);
const submitted = ref(false);
const submitting = ref(false);
const lastScore = ref(null);
const passed = ref(false);
const remediation = ref([]);
const canRetake = ref(true);
const attemptCount = ref(null);
const maxAttempts = ref(null);
const minimumScore = ref(null);
const shuffledQuestions = ref([]);
const questionMappings = ref([]); // Maps shuffled indices to original indices

// Shuffle array function
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Get display questions (randomized if needed)
const displayQuestions = computed(() => {
  if (props.content.randomizeAnswers) {
    return shuffledQuestions.value;
  }
  return props.content.questions || [];
});

const initializeAnswers = () => {
  answers.value = new Array(props.content.questions?.length || 0).fill('');
};

const initializeShuffledQuestions = () => {
  if (!props.content.questions) return;
  
  shuffledQuestions.value = props.content.questions.map((q, originalIndex) => {
    if (q.type === 'multiple_choice' && props.content.randomizeAnswers && q.options) {
      // Create mapping of shuffled indices to original indices
      const optionIndices = q.options.map((_, i) => i);
      const shuffledIndices = shuffleArray(optionIndices);
      
      // Find where the correct answer moved to
      const correctOriginalIndex = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0;
      const correctNewIndex = shuffledIndices.indexOf(correctOriginalIndex);
      
      const shuffledOptions = shuffledIndices.map((i) => optionDisplayText(q.options[i]));
      const correctText = optionDisplayText(q.options[correctOriginalIndex]);
      return {
        ...q,
        options: shuffledOptions,
        correctAnswer: correctText,
        originalIndex: originalIndex
      };
    }
    return { ...q, originalIndex: originalIndex };
  });
};

const getQuestionTypeLabel = (type) => {
  const labels = {
    'multiple_choice': 'Multiple Choice',
    'true_false': 'True/False',
    'text': 'Text Answer'
  };
  return labels[type] || type;
};

const submitQuiz = async () => {
  try {
    submitting.value = true;

    const totalQuestions = props.content.questions?.length || 0;
    // Map display-order answers back to original question order for the server
    const answersInOrder = new Array(totalQuestions).fill('');
    displayQuestions.value.forEach((question, displayIndex) => {
      const originalIndex = question.originalIndex !== undefined ? question.originalIndex : displayIndex;
      answersInOrder[originalIndex] = answers.value[displayIndex];
    });

    const res = await api.post(`/quizzes/${props.moduleId}/submit`, {
      answers: answersInOrder
    });
    const data = res.data || {};
    const score = data.attempt?.score ?? data.score ?? 0;
    const passedValue = Boolean(data.passed);

    lastScore.value = score;
    passed.value = passedValue;
    remediation.value = Array.isArray(data.remediation) ? data.remediation : [];
    canRetake.value = data.allowRetake !== false && (props.content.allowRetake !== false);
    attemptCount.value = data.attemptCount ?? null;
    maxAttempts.value = data.maxAttempts ?? props.content.maxAttempts ?? null;
    minimumScore.value = data.minimumScore ?? props.content.minimumScore ?? null;
    submitted.value = true;

    emit('quiz-completed', {
      score,
      passed: passedValue,
      totalQuestions,
      minimumScore: minimumScore.value,
      remediation: remediation.value
    });
  } catch (error) {
    alert(error.response?.data?.error?.message || 'Failed to submit quiz');
  } finally {
    submitting.value = false;
  }
};

const resetQuiz = () => {
  submitted.value = false;
  lastScore.value = null;
  passed.value = false;
  remediation.value = [];
  initializeAnswers();
  initializeShuffledQuestions();
};

onMounted(() => {
  initializeAnswers();
  initializeShuffledQuestions();
});
</script>

<style scoped>
.quiz-container {
  width: 100%;
}

.quiz-header {
  margin-bottom: 30px;
}

.quiz-header h3 {
  color: #2c3e50;
  margin-bottom: 10px;
}

.quiz-header p {
  color: #7f8c8d;
}

.remediation-panel {
  margin: 16px 0;
  padding: 16px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--warning, #f0ad4e) 12%, white);
  border: 1px solid color-mix(in srgb, var(--warning, #f0ad4e) 35%, var(--border));
  text-align: left;
}

.remediation-panel h4 {
  margin: 0 0 12px;
  font-size: 14px;
}

.remediation-item {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.remediation-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.remediation-q {
  margin: 0 0 6px;
  font-weight: 600;
  font-size: 13px;
}

.remediation-explain,
.remediation-html {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.attempt-meta {
  font-size: 13px;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.quiz-form {
  max-width: 800px;
}

.question-item {
  background: var(--bg-alt);
  padding: 24px;
  border-radius: 12px;
  margin-bottom: 24px;
  border: 2px solid var(--border);
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.question-number {
  font-weight: 600;
  color: #007bff;
}

.question-type {
  font-size: 12px;
  color: #7f8c8d;
  background: white;
  padding: 4px 8px;
  border-radius: 4px;
}

.question-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
  line-height: 1.6;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-label {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid var(--border);
}

.option-label:hover {
  background-color: var(--bg-alt);
  border-color: var(--primary);
}

.option-label input[type="radio"] {
  cursor: pointer;
}

.text-answer textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 16px;
  font-family: inherit;
}

.quiz-result {
  text-align: center;
  padding: 48px;
  background: var(--bg-alt);
  border-radius: 12px;
  border: 2px solid var(--border);
}

.result-badge {
  display: inline-block;
  padding: 15px 30px;
  border-radius: 8px;
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 20px;
}

.result-badge.passed {
  background-color: #d4edda;
  color: #155724;
}

.result-badge.failed {
  background-color: #f8d7da;
  color: #721c24;
}

.score {
  font-size: 32px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 10px;
}

.minimum-score {
  color: #7f8c8d;
  margin-bottom: 20px;
}
</style>

