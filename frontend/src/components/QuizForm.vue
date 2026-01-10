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
      <p v-if="content.minimumScore" class="minimum-score">
        Minimum Required: {{ content.minimumScore }}%
      </p>
      <button v-if="!passed && content.allowRetake" @click="resetQuiz" class="btn btn-primary">
        Retake Quiz
      </button>
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
              :value="option"
              v-model="answers[index]"
              required
            />
            <span>{{ option }}</span>
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
      
      return {
        ...q,
        options: shuffledIndices.map(i => q.options[i]),
        correctAnswer: correctNewIndex, // Update to new position
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
    
    // Calculate score client-side
    let correctCount = 0;
    const totalQuestions = props.content.questions?.length || 0;
    
    displayQuestions.value.forEach((question, displayIndex) => {
      const originalIndex = question.originalIndex !== undefined ? question.originalIndex : displayIndex;
      const userAnswer = answers.value[displayIndex];
      
      if (question.type === 'multiple_choice') {
        // Compare selected option index
        const selectedIndex = question.options.findIndex(opt => opt === userAnswer);
        const correctIndex = typeof question.correctAnswer === 'number' ? question.correctAnswer : 0;
        if (selectedIndex === correctIndex) {
          correctCount++;
        }
      } else if (question.type === 'true_false') {
        const correctAnswer = question.correctAnswer === 'true' || question.correctAnswer === true;
        const userAnswerBool = userAnswer === 'true' || userAnswer === true;
        if (correctAnswer === userAnswerBool) {
          correctCount++;
        }
      } else if (question.type === 'text') {
        // Case-insensitive comparison for text answers
        const correct = (question.correctAnswer || '').toLowerCase().trim();
        const user = (userAnswer || '').toLowerCase().trim();
        if (correct && user && correct === user) {
          correctCount++;
        }
      }
    });
    
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const minimumScore = props.content.minimumScore || 70;
    const passedValue = score >= minimumScore;
    
    // Save quiz attempt to backend
    try {
      await api.post(`/quizzes/${props.moduleId}/submit`, {
        answers: answers.value,
        score: score,
        passed: passedValue
      });
    } catch (err) {
      console.error('Failed to save quiz attempt:', err);
      // Continue even if save fails
    }
    
    lastScore.value = score;
    passed.value = passedValue;
    submitted.value = true;
    
    emit('quiz-completed', {
      score: score,
      passed: passedValue,
      correctCount: correctCount,
      totalQuestions: totalQuestions,
      minimumScore: minimumScore
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
  initializeAnswers();
  initializeShuffledQuestions(); // Re-shuffle if needed
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

