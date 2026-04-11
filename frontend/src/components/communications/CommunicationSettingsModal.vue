<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal comms-settings-modal">
      <div class="modal-header">
        <h3>Communication Settings</h3>
        <button type="button" class="close-btn" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div v-if="loading" class="modal-body loading">
        Loading settings…
      </div>
      <div v-else class="modal-body">
        <div v-if="error" class="error-box">{{ error }}</div>
        <div v-if="success" class="success-box">{{ success }}</div>

        <section class="settings-section">
          <h4>Availability & Vacation</h4>
          <div class="form-row">
            <label class="toggle-label">
              <input type="checkbox" v-model="settings.vacation_mode_enabled" />
              <span>Vacation Mode (Redirects all calls to vacation voicemail)</span>
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h4>Call & Text Routing</h4>
          <div class="settings-grid">
            <div class="form-group">
              <label>Inbound Calls</label>
              <select v-model="settings.inbound_enabled" class="select">
                <option :value="true">Enabled</option>
                <option :value="false">Disabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Inbound Texts</label>
              <select v-model="settings.sms_inbound_enabled" class="select">
                <option :value="true">Enabled</option>
                <option :value="false">Disabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Forward Calls To</label>
              <input 
                v-model="settings.forward_to_phone" 
                class="input" 
                placeholder="+15551234567" 
                title="Your personal phone number to receive forwarded calls"
              />
            </div>
            <div class="form-group">
              <label>Wait Music</label>
              <select v-model="settings.wait_music_id" class="select">
                <option :value="null">Default Platform Music</option>
                <option value="classic">Classical Piano</option>
                <option value="jazz">Smooth Jazz</option>
                <option value="nature">Nature Sounds</option>
              </select>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h4>Custom Voicemail Greetings</h4>
          <p class="section-hint">Messages will be played using Text-to-Speech if no audio is uploaded.</p>
          
          <div class="form-group">
            <label>Working Hours Voicemail</label>
            <textarea 
              v-model="settings.voicemail_message" 
              class="input textarea" 
              placeholder="Sorry I missed your call. Please leave a message."
              rows="2"
            ></textarea>
          </div>

          <div class="form-group">
            <label>After Hours (Out of Office) Voicemail</label>
            <textarea 
              v-model="settings.voicemail_ooo_message" 
              class="input textarea" 
              placeholder="You have reached me outside of my office hours. I will respond as soon as possible."
              rows="2"
            ></textarea>
          </div>

          <div class="form-group">
            <label>Vacation Voicemail</label>
            <textarea 
              v-model="settings.voicemail_vacation_message" 
              class="input textarea" 
              placeholder="I am currently on vacation and will be back on [Date]. Please contact support for urgent needs."
              rows="2"
            ></textarea>
          </div>

          <!-- Voicemail Preview -->
          <div v-if="settings.voicemail_message || settings.voicemail_ooo_message || settings.voicemail_vacation_message" class="voicemail-preview">
            <div class="preview-header">Voicemail Preview (Text-to-Speech)</div>
            <div class="preview-card">
              <div class="preview-item">
                <strong>Working:</strong> "{{ settings.voicemail_message || 'You have reached [Name]...' }}"
              </div>
              <div class="preview-item">
                <strong>After Hours:</strong> "{{ settings.voicemail_ooo_message || 'I am currently away...' }}"
              </div>
              <div class="preview-item">
                <strong>Vacation:</strong> "{{ settings.voicemail_vacation_message || 'I am on vacation...' }}"
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')" :disabled="saving">Cancel</button>
        <button type="button" class="btn btn-primary" @click="save" :disabled="saving || loading">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const emit = defineEmits(['close', 'saved']);

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const settings = ref({
  inbound_enabled: true,
  sms_inbound_enabled: true,
  forward_to_phone: '',
  wait_music_id: null,
  vacation_mode_enabled: false,
  voicemail_enabled: true,
  voicemail_message: '',
  voicemail_ooo_message: '',
  voicemail_vacation_message: ''
});

async function load() {
  try {
    loading.value = true;
    const resp = await api.get('/communications/calls/settings');
    settings.value = {
      ...settings.value,
      ...resp.data
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load settings';
  } finally {
    loading.value = false;
  }
}

async function save() {
  try {
    saving.value = true;
    error.value = '';
    success.value = '';
    await api.put('/communications/calls/settings', settings.value);
    success.value = 'Settings saved successfully';
    emit('saved');
    setTimeout(() => {
      emit('close');
    }, 1500);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save settings';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}

.comms-settings-modal {
  background: white;
  width: 560px;
  max-width: 95vw;
  max-height: 90vh;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

.modal-header {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border, #eee);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
}

.close-btn svg { width: 20px; height: 20px; }

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-secondary);
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section h4 {
  margin: 0 0 12px 0;
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary-color, #2563eb);
}

.section-hint {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
  background: #f8faff;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e0e7ff;
}

.toggle-label input {
  width: 18px;
  height: 18px;
}

.input {
  border: 1px solid var(--border, #d1d5db);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.95rem;
  width: 100%;
  box-sizing: border-box;
}

.textarea {
  resize: vertical;
  min-height: 60px;
}

.select {
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  padding-right: 36px;
  background-color: white;
}

.modal-footer {
  padding: 18px 24px;
  border-top: 1px solid var(--border, #eee);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.success-box {
  background: #ecfdf5;
  color: #065f46;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #a7f3d0;
  font-size: 0.9rem;
}

.error-box {
  background: #fef2f2;
  color: #991b1b;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #fecaca;
  font-size: 0.9rem;
}

.btn {
  padding: 10px 20px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.1s;
}

.btn-primary {
  background: var(--primary-color, #2563eb);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border-color: #d1d5db;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Voicemail Preview Styles */
.voicemail-preview {
  margin-top: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.preview-header {
  font-size: 0.7rem;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  margin-bottom: 10px;
  letter-spacing: 0.05em;
}
.preview-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.preview-item {
  font-size: 0.82rem;
  line-height: 1.4;
  color: #1e293b;
  padding: 8px;
  background: white;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
}
.preview-item strong {
  color: var(--primary-color, #2563eb);
  display: block;
  font-size: 0.75rem;
  margin-bottom: 2px;
}
</style>
