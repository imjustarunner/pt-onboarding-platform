<template>
  <div class="training-focus-tab">
    <div v-if="loading" class="loading">Loading training focuses...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <!-- Individual Module Tasks (not part of a training focus) -->
      <div v-if="individualModules.length > 0" class="individual-modules-section">
        <h2 style="margin-bottom: 16px; font-size: 18px; font-weight: 600;">Assigned Modules</h2>
        <div class="modules-list">
          <div
            v-for="moduleTask in individualModules"
            :key="moduleTask.id"
            class="module-item"
            :class="{ completed: moduleTask.status === 'completed' }"
            @click="goToModule(moduleTask.reference_id)"
          >
            <div class="module-status-icon">
              <span v-if="moduleTask.status === 'completed'" class="checkmark">✓</span>
              <span v-else-if="moduleTask.status === 'in_progress'" class="in-progress">●</span>
              <span v-else class="not-started">○</span>
            </div>
            <div class="module-info">
              <span class="module-title">{{ moduleTask.title }}</span>
              <span class="module-status">{{ getStatusLabel(moduleTask.status) }}</span>
              <span v-if="moduleTask.due_date" class="module-due-date">Due: {{ formatDate(moduleTask.due_date) }}</span>
            </div>
          </div>
        </div>
        <hr style="margin: 24px 0; border: none; border-top: 2px solid var(--border);" />
      </div>
      
      <div v-if="sortedFocuses.length === 0 && individualModules.length === 0" class="empty-state">
        <p>No training focuses or modules assigned.</p>
      </div>
      
      <div v-if="sortedFocuses.length > 0">
        <div class="sort-controls">
          <label for="sort-select">Sort by:</label>
          <select id="sort-select" v-model="sortOption" class="sort-select">
            <option value="unfinished">Unfinished First</option>
            <option value="alphabetical">Alphabetical (A-Z)</option>
            <option value="completion">Completion % (Lowest First)</option>
          </select>
        </div>
        
        <div class="focuses-list">
        <div v-for="focus in sortedFocuses" :key="focus.id" class="focus-card">
          <div class="focus-header">
            <div class="focus-info">
              <h3>{{ focus.name }}</h3>
              <p v-if="focus.description" class="focus-description">{{ focus.description }}</p>
              <div class="focus-meta">
                <span class="agency-badge">{{ focus.agencyName }}</span>
                <span class="progress-badge">{{ focus.completionPercent }}% Complete</span>
                <button 
                  v-if="focus.completionPercent === 100" 
                  @click.stop="downloadTrainingFocusCertificate(focus.id)" 
                  class="btn-certificate-download-focus"
                  :disabled="downloadingCertificates.has(`focus-${focus.id}`)"
                >
                  {{ downloadingCertificates.has(`focus-${focus.id}`) ? 'Downloading...' : '📄 Download Certificate' }}
                </button>
              </div>
            </div>
            <div class="focus-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: focus.completionPercent + '%' }"></div>
              </div>
              <span class="progress-text">{{ focus.modulesCompleted }} / {{ focus.modulesTotal }} modules</span>
            </div>
          </div>
          
          <div class="modules-section">
            <h4>Modules</h4>
            <div class="modules-list">
              <div
                v-for="module in getSortedModules(focus.modules)"
                :key="module.id"
                class="module-item"
                :class="{ completed: module.status === 'completed' }"
                @click="goToModule(module.id)"
              >
                <div class="module-status-icon">
                  <span v-if="module.status === 'completed'" class="checkmark">✓</span>
                  <span v-else-if="module.status === 'in_progress'" class="in-progress">●</span>
                  <span v-else class="not-started">○</span>
                </div>
                <div class="module-info">
                  <span class="module-title">{{ module.title }}</span>
                  <span class="module-status">{{ getStatusLabel(module.status) }}</span>
                  <div v-if="module.status === 'completed'" class="module-completion-details">
                    <span v-if="module.timeSpentMinutes > 0" class="completion-time">
                      Time: {{ formatTime(module.timeSpentMinutes) }}
                    </span>
                    <span v-if="module.completedAt" class="completion-date">
                      Completed: {{ formatDate(module.completedAt) }}
                    </span>
                    <span v-if="module.dueDate" class="completion-date">
                      Due: {{ formatDate(module.dueDate) }}
                    </span>
                    <span v-if="module.quizCorrectCount !== null && module.quizTotalQuestions" class="quiz-score">
                      Quiz: {{ module.quizCorrectCount }}/{{ module.quizTotalQuestions }} 
                      ({{ module.quizScore }}%)
                      <span v-if="module.quizPassed !== null" :class="['quiz-status', module.quizPassed ? 'passed' : 'failed']">
                        {{ module.quizPassed ? '✓' : '✗' }}
                      </span>
                    </span>
                    <button 
                      @click.stop="downloadModuleCertificate(module.id)" 
                      class="btn-certificate-download"
                      :disabled="downloadingCertificates.has(module.id)"
                    >
                      {{ downloadingCertificates.has(module.id) ? 'Downloading...' : '📄 Download Certificate' }}
                    </button>
                  </div>
                  <span v-else-if="module.dueDate" class="module-due-date">Due: {{ formatDate(module.dueDate) }}</span>
                </div>
                <div class="module-time" v-if="module.timeSpentMinutes > 0 && module.status !== 'completed'">
                  {{ formatTime(module.timeSpentMinutes) }}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const emit = defineEmits(['update-count']);

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const loading = ref(true);
const error = ref('');
const allFocuses = ref([]);
const individualModules = ref([]);
const sortOption = ref('unfinished');
const downloadingCertificates = ref(new Set());
const certificates = ref({}); // Store certificates by module/training focus ID

// Computed property to filter focuses by current agency
const focuses = computed(() => {
  if (!agencyStore.currentAgency) return [];
  return allFocuses.value.filter(focus => focus.agencyId === agencyStore.currentAgency.id);
});

const sortedFocuses = computed(() => {
  const focusList = [...focuses.value];
  
  switch (sortOption.value) {
    case 'unfinished':
      // Sort focuses with incomplete modules first
      return focusList.sort((a, b) => {
        const aIncomplete = a.modules.filter(m => m.status !== 'completed').length;
        const bIncomplete = b.modules.filter(m => m.status !== 'completed').length;
        
        // Focuses with more incomplete modules first
        if (aIncomplete !== bIncomplete) {
          return bIncomplete - aIncomplete;
        }
        
        // If same number of incomplete, sort by completion %
        return a.completionPercent - b.completionPercent;
      });
      
    case 'alphabetical':
      return focusList.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
    case 'completion':
      return focusList.sort((a, b) => a.completionPercent - b.completionPercent);
      
    default:
      return focusList;
  }
});

const getSortedModules = (modules) => {
  // Always sort modules: incomplete first, then by status
  return [...modules].sort((a, b) => {
    // Incomplete modules first
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    
    // Within same completion status, sort by status order
    const statusOrder = { 'not_started': 0, 'in_progress': 1, 'completed': 2 };
    return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
  });
};

const updateFilteredFocuses = () => {
  // Calculate incomplete module count for current agency only
  const incompleteCount = focuses.value.reduce((count, focus) => {
    return count + focus.modules.filter(m => m.status !== 'completed').length;
  }, 0);
  
  // Add incomplete individual module tasks
  const incompleteIndividual = individualModules.value.filter(m => m.status !== 'completed' && m.status !== 'overridden').length;
  
  emit('update-count', incompleteCount + incompleteIndividual);
};

// Watch for agency changes and update counts
watch(() => agencyStore.currentAgency, () => {
  updateFilteredFocuses();
}, { immediate: true });

const fetchTrainingFocuses = async () => {
  try {
    loading.value = true;
    const userId = authStore.user?.id;
    if (!userId) {
      error.value = 'User not found';
      return;
    }
    
    // Fetch training focuses and individual module tasks in parallel
    const [focusesResponse, tasksResponse] = await Promise.all([
      api.get(`/users/${userId}/training-focuses`),
      api.get('/tasks', { params: { taskType: 'training' } })
    ]);
    
    allFocuses.value = focusesResponse.data.focuses || [];
    
    // Get individual module tasks (tasks that are not part of a training focus)
    // These are tasks with taskType='training' and a reference_id pointing to a module
    const allTasks = tasksResponse.data || [];
    const moduleTaskIds = new Set();
    
    // Collect all module IDs from training focuses
    allFocuses.value.forEach(focus => {
      focus.modules.forEach(module => {
        moduleTaskIds.add(module.id);
      });
    });
    
    // Filter tasks to only include those with modules not in any training focus
    // Also fetch module details for each task
    const individualModuleTasks = [];
    for (const task of allTasks) {
      if (task.task_type === 'training' && task.reference_id && 
          task.status !== 'completed' && task.status !== 'overridden') {
        // Check if this module is part of any training focus
        if (!moduleTaskIds.has(task.reference_id)) {
          try {
            // Fetch module details
            const moduleResponse = await api.get(`/modules/${task.reference_id}`);
            const module = moduleResponse.data;
            
            // Get progress for this module
            let moduleProgress = { status: 'not_started', timeSpentMinutes: 0, completedAt: null };
            let quizStats = { latestScore: null, correctCount: null, totalQuestions: null, passed: null };
            try {
              const progressResponse = await api.get(`/progress`);
              const progress = progressResponse.data.find(p => p.module_id === task.reference_id);
              if (progress) {
                moduleProgress = {
                  status: progress.status || 'not_started',
                  timeSpentMinutes: progress.time_spent_minutes || 0,
                  completedAt: progress.completed_at || null
                };
              }
              
              // Get quiz stats if module is completed
              if (moduleProgress.status === 'completed') {
                try {
                  const quizAttemptsResponse = await api.get(`/quizzes/${task.reference_id}/attempts`);
                  if (quizAttemptsResponse.data && quizAttemptsResponse.data.length > 0) {
                    const latestAttempt = quizAttemptsResponse.data[0];
                    // Get quiz content to determine total questions
                    const contentResponse = await api.get(`/modules/${task.reference_id}/content`);
                    const quizContent = contentResponse.data.find(item => item.content_type === 'quiz');
                    if (quizContent) {
                      const quizData = typeof quizContent.content_data === 'string' 
                        ? JSON.parse(quizContent.content_data) 
                        : quizContent.content_data;
                      const totalQuestions = quizData.questions?.length || 0;
                      const minimumScore = quizData.minimumScore || null;
                      if (totalQuestions > 0 && latestAttempt.score !== null) {
                        const correctCount = Math.round((latestAttempt.score / 100) * totalQuestions);
                        quizStats = {
                          latestScore: latestAttempt.score,
                          correctCount,
                          totalQuestions,
                          passed: minimumScore ? latestAttempt.score >= minimumScore : true,
                          minimumScore
                        };
                      }
                    }
                  }
                } catch (e) {
                  // Quiz stats not available, use defaults
                }
              }
            } catch (e) {
              // Progress not found, use defaults
            }
            
            individualModuleTasks.push({
              id: task.id,
              reference_id: task.reference_id,
              title: task.title || module.title,
              description: task.description || module.description,
              status: moduleProgress.status,
              due_date: task.due_date,
              timeSpentMinutes: moduleProgress.timeSpentMinutes,
              completedAt: moduleProgress.completedAt,
              quizScore: quizStats.latestScore,
              quizCorrectCount: quizStats.correctCount,
              quizTotalQuestions: quizStats.totalQuestions,
              quizPassed: quizStats.passed,
              quizMinimumScore: quizStats.minimumScore
            });
          } catch (e) {
            // Module not found or error, skip this task
            console.warn(`Failed to fetch module ${task.reference_id} for task ${task.id}:`, e);
          }
        }
      }
    }
    
    individualModules.value = individualModuleTasks;
    
    // Filter by current agency and calculate incomplete module count
    updateFilteredFocuses();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load training focuses';
  } finally {
    loading.value = false;
  }
};

const goToModule = (moduleId) => {
  router.push(`/module/${moduleId}`);
};

const getStatusLabel = (status) => {
  const labels = {
    'not_started': 'Not Started',
    'in_progress': 'In Progress',
    'completed': 'Completed'
  };
  return labels[status] || 'Not Started';
};

const formatTime = (minutes) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  await fetchTrainingFocuses();
});
</script>

<style scoped>
.focuses-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.focus-card {
  padding: 24px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.focus-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  gap: 24px;
}

.focus-info {
  flex: 1;
}

.focus-info h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.focus-description {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.focus-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.agency-badge {
  padding: 4px 12px;
  background: #e5e7eb;
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.progress-badge {
  padding: 4px 12px;
  background: #dbeafe;
  border-radius: 12px;
  font-size: 12px;
  color: #1e40af;
  font-weight: 600;
}

.focus-progress {
  min-width: 200px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.modules-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}

.modules-section h4 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 16px;
}

.modules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.module-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
}

.module-item:hover {
  border-color: var(--primary);
  background: #f0f4ff;
}

.module-item.completed {
  background: #f0fdf4;
  border-color: #22c55e;
}

.module-status-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.checkmark {
  color: #22c55e;
  font-weight: bold;
  font-size: 18px;
}

.in-progress {
  color: var(--primary);
  font-size: 12px;
}

.not-started {
  color: #9ca3af;
  font-size: 14px;
}

.module-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.module-title {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
}

.module-status {
  font-size: 12px;
  color: var(--text-secondary);
}

.module-time {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.module-completion-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: var(--text-secondary);
}

.completion-time,
.completion-date {
  display: inline-block;
  margin-right: 12px;
}

.quiz-score {
  display: inline-block;
  margin-right: 8px;
}

.quiz-status {
  display: inline-block;
  margin-left: 4px;
  font-weight: 600;
}

.quiz-status.passed {
  color: #22c55e;
}

.quiz-status.failed {
  color: #dc2626;
}

.due-date-info {
  font-size: 12px;
  color: var(--text-secondary);
}

.module-due-date {
  font-size: 11px;
  color: #dc2626;
  font-weight: 500;
}

.individual-modules-section {
  margin-bottom: 32px;
}

.individual-modules-section h2 {
  color: var(--text-primary);
  margin-bottom: 16px;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.sort-controls label {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
}

.sort-select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: white;
  font-size: 14px;
  cursor: pointer;
  color: var(--text-primary);
}

.sort-select option {
  color: var(--text-primary);
  background: white;
}

.sort-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.btn-certificate-download,
.btn-certificate-download-focus {
  padding: 6px 12px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  margin-top: 8px;
}

.btn-certificate-download-focus {
  margin-top: 0;
  margin-left: 8px;
}

.btn-certificate-download:hover:not(:disabled),
.btn-certificate-download-focus:hover:not(:disabled) {
  background: var(--primary-dark, #a67c00);
  transform: translateY(-1px);
}

.btn-certificate-download:disabled,
.btn-certificate-download-focus:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

