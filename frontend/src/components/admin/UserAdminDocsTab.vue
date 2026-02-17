<template>
  <div class="tab-panel">
    <div class="header-row">
      <h2>Admin Documentation</h2>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="reload" :disabled="loading">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
        <button class="btn btn-primary btn-sm" @click="openAddModal" :disabled="creating">
          Add documentation
        </button>
      </div>
    </div>

    <div class="hint">
      Track HR/remediation/issue notes and uploaded documents. Content may require admin approval to open.
    </div>

    <div v-if="isBackoffice" class="deleted-toggle-row">
      <label class="toggle-label">
        <input type="checkbox" v-model="showDeleted" />
        Show deleted entries (audit trail)
      </label>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="loading">Loading…</div>

    <div v-else-if="docs.length === 0" class="empty">
      No entries yet.
      <div class="muted">User ID: {{ userId }}</div>
    </div>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Created</th>
            <th>Created by</th>
            <th>Content</th>
            <th style="width: 220px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>
              <div class="title">{{ d.title }}</div>
              <div v-if="d.myLatestRequest?.status === 'pending'" class="badge badge-secondary">Access requested</div>
              <div v-if="d.isDeleted" class="badge badge-danger">Deleted</div>
              <div v-if="d.isLegalHold" class="badge badge-warning">Legal hold</div>
              <div v-if="d.isDeleted" class="muted" style="margin-top: 6px;">
                {{ formatDateTime(d.deletedAt) }} by {{ d.deletedByName || `User ${d.deletedByUserId}` }}
              </div>
              <div v-if="d.isLegalHold" class="muted" style="margin-top: 6px;">
                Hold set {{ formatDateTime(d.legalHoldSetAt) }} by {{ d.legalHoldSetByName || `User ${d.legalHoldSetByUserId}` }}
                <span v-if="d.legalHoldReason"> | Reason: {{ d.legalHoldReason }}</span>
              </div>
            </td>
            <td>{{ d.docType || '-' }}</td>
            <td>{{ formatDateTime(d.createdAt) }}</td>
            <td>{{ d.createdByName || `User ${d.createdByUserId}` }}</td>
            <td class="muted">
              <span v-if="d.hasNote">Note</span><span v-if="d.hasNote && d.hasFile"> + </span><span v-if="d.hasFile">File</span>
              <span v-if="!d.hasNote && !d.hasFile">-</span>
            </td>
            <td class="cell-actions">
              <button
                v-if="d.canView"
                class="btn btn-primary btn-sm"
                @click="openDoc(d)"
                :disabled="d.isDeleted"
              >
                Open
              </button>
              <button
                v-else-if="!d.isDeleted"
                class="btn btn-secondary btn-sm"
                @click="requestAccess(d)"
                :disabled="requestingAccessIds.has(d.id) || d.myLatestRequest?.status === 'pending'"
              >
                {{ requestingAccessIds.has(d.id) ? 'Requesting…' : (d.myLatestRequest?.status === 'pending' ? 'Requested' : 'Request access') }}
              </button>
              <button
                v-if="d.canDelete"
                class="btn btn-secondary btn-sm"
                @click="deleteDoc(d)"
                :disabled="deletingIds.has(d.id)"
              >
                {{ deletingIds.has(d.id) ? 'Deleting…' : 'Delete (retain audit copy)' }}
              </button>
              <button
                v-if="isBackoffice && d.isDeleted"
                class="btn btn-primary btn-sm"
                @click="restoreDoc(d)"
                :disabled="restoringIds.has(d.id)"
              >
                {{ restoringIds.has(d.id) ? 'Restoring…' : 'Restore' }}
              </button>
              <button
                v-if="isBackoffice && !d.isDeleted && !d.isLegalHold"
                class="btn btn-secondary btn-sm"
                @click="setLegalHold(d)"
                :disabled="legalHoldIds.has(d.id)"
              >
                {{ legalHoldIds.has(d.id) ? 'Saving…' : 'Place legal hold' }}
              </button>
              <button
                v-if="isBackoffice && d.isLegalHold"
                class="btn btn-secondary btn-sm"
                @click="releaseLegalHold(d)"
                :disabled="legalHoldIds.has(d.id)"
              >
                {{ legalHoldIds.has(d.id) ? 'Saving…' : 'Release legal hold' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!isBackoffice && docs.length > 0" class="provider-scope">
        <button class="btn btn-secondary btn-sm" @click="requestProviderAccess" :disabled="requestingProviderAccess">
          {{ requestingProviderAccess ? 'Requesting…' : 'Request provider-wide access' }}
        </button>
        <span class="muted" style="margin-left: 10px;">
          Admin can grant time-limited access for all entries for this provider.
        </span>
      </div>
    </div>

    <!-- Add Documentation Modal -->
    <div v-if="showAdd" class="modal-overlay" @click.self="closeAddModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>Add documentation</h3>
          <button class="btn btn-secondary btn-sm" @click="closeAddModal" :disabled="creating">Close</button>
        </div>

        <div class="form">
          <div class="form-group">
            <label>Title *</label>
            <input class="input" v-model="formTitle" type="text" placeholder="e.g., Remediation plan initiated" />
          </div>

          <div class="form-group">
            <label>Type</label>
            <select class="input" v-model="formType">
              <option value="">(none)</option>
              <option value="Issue">Issue</option>
              <option value="Remediation">Remediation</option>
              <option value="Performance">Performance</option>
              <option value="Complaint">Complaint</option>
              <option value="Policy">Policy</option>
              <option value="Other">Other</option>
              <option value="__custom__">Custom…</option>
            </select>
            <input
              v-if="formType === '__custom__'"
              class="input"
              v-model="formTypeCustom"
              type="text"
              placeholder="Custom type"
              style="margin-top: 8px;"
            />
          </div>

          <div class="form-group">
            <label>Paste note / text</label>
            <textarea class="input textarea" v-model="formNoteText" rows="6" placeholder="Add details here (optional if uploading a document)"></textarea>
          </div>

          <div class="form-group">
            <label>Upload document (PDF/DOCX/TXT/JPG/PNG)</label>
            <input class="input" type="file" @change="onFileChange" />
            <div v-if="formFileName" class="muted" style="margin-top: 6px;">Selected: {{ formFileName }}</div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeAddModal" :disabled="creating">Cancel</button>
            <button class="btn btn-primary" @click="submitCreate" :disabled="creating">
              {{ creating ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Note Viewer Modal -->
    <div v-if="showNote" class="modal-overlay" @click.self="showNote = false">
      <div class="modal large" @click.stop>
        <div class="modal-header">
          <h3>{{ noteTitle || 'Note' }}</h3>
          <button class="btn btn-secondary btn-sm" @click="showNote = false">Close</button>
        </div>
        <pre class="note-body">{{ noteText }}</pre>
      </div>
    </div>

    <!-- Admin review panel -->
    <div v-if="isBackoffice" class="admin-panel">
      <h3 style="margin: 18px 0 8px;">Access requests</h3>
      <div v-if="requestsLoading" class="loading">Loading requests…</div>
      <div v-else-if="requestsError" class="error">{{ requestsError }}</div>
      <div v-else-if="pendingRequests.length === 0" class="empty">No pending requests.</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Requested</th>
              <th>Requested by</th>
              <th>Scope</th>
              <th style="width: 280px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in pendingRequests" :key="r.id">
              <td>{{ formatDateTime(r.requested_at) }}</td>
              <td>{{ formatPerson(r.requested_by_first_name, r.requested_by_last_name, r.requested_by_email, r.requested_by_user_id) }}</td>
              <td>{{ r.doc_id ? (docTitle(r.doc_id) || `Doc #${r.doc_id}`) : 'Provider-wide' }}</td>
              <td class="cell-actions">
                <button class="btn btn-primary btn-sm" @click="openApproveModal(r)" :disabled="approvingId === r.id">
                  Approve
                </button>
                <button class="btn btn-secondary btn-sm" @click="denyRequest(r)" :disabled="denyingId === r.id">
                  {{ denyingId === r.id ? 'Denying…' : 'Deny' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style="margin: 18px 0 8px;">Access grants</h3>
      <div v-if="grantsLoading" class="loading">Loading grants…</div>
      <div v-else-if="grantsError" class="error">{{ grantsError }}</div>
      <div v-else-if="activeGrants.length === 0" class="empty">No active grants.</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Granted</th>
              <th>Grantee</th>
              <th>Scope</th>
              <th>Expires</th>
              <th style="width: 140px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in activeGrants" :key="g.id">
              <td>{{ formatDateTime(g.granted_at) }}</td>
              <td>{{ formatPerson(g.grantee_first_name, g.grantee_last_name, g.grantee_email, g.grantee_user_id) }}</td>
              <td>{{ g.doc_id ? (docTitle(g.doc_id) || `Doc #${g.doc_id}`) : 'Provider-wide' }}</td>
              <td>{{ g.expires_at ? formatDateTime(g.expires_at) : '—' }}</td>
              <td class="cell-actions">
                <button class="btn btn-secondary btn-sm" @click="revokeGrant(g)" :disabled="revokingId === g.id">
                  {{ revokingId === g.id ? 'Revoking…' : 'Revoke' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Approve modal -->
    <div v-if="approveModal" class="modal-overlay" @click.self="approveModal = null">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>Approve access</h3>
          <button class="btn btn-secondary btn-sm" @click="approveModal = null" :disabled="approvingId === approveModal?.id">Close</button>
        </div>

        <div class="form">
          <div class="muted" style="margin-bottom: 10px;">
            Grant {{ approveModal?.doc_id ? 'item' : 'provider-wide' }} access to
            <strong>{{ formatPerson(approveModal?.requested_by_first_name, approveModal?.requested_by_last_name, approveModal?.requested_by_email, approveModal?.requested_by_user_id) }}</strong>.
          </div>

          <div class="form-group">
            <label>Duration</label>
            <select class="input" v-model="approveDuration">
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="custom">Custom…</option>
            </select>
            <input
              v-if="approveDuration === 'custom'"
              class="input"
              type="datetime-local"
              v-model="approveCustomExpiry"
              style="margin-top: 8px;"
            />
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="approveModal = null" :disabled="approvingId === approveModal?.id">Cancel</button>
            <button class="btn btn-primary" @click="approveRequest" :disabled="approvingId === approveModal?.id">
              {{ approvingId === approveModal?.id ? 'Approving…' : 'Approve' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  userId: { type: Number, required: true }
});

const authStore = useAuthStore();
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const isBackoffice = computed(() => ['admin', 'super_admin', 'support'].includes(role.value));

const loading = ref(false);
const error = ref('');
const docs = ref([]);

const showAdd = ref(false);
const creating = ref(false);
const formTitle = ref('');
const formType = ref('');
const formTypeCustom = ref('');
const formNoteText = ref('');
const formFile = ref(null);
const formFileName = ref('');

const showNote = ref(false);
const noteText = ref('');
const noteTitle = ref('');

const requestingAccessIds = ref(new Set());
const requestingProviderAccess = ref(false);
const deletingIds = ref(new Set());
const restoringIds = ref(new Set());
const legalHoldIds = ref(new Set());
const showDeleted = ref(false);

// Admin review state
const requestsLoading = ref(false);
const requestsError = ref('');
const requests = ref([]);

const grantsLoading = ref(false);
const grantsError = ref('');
const grants = ref([]);

const approvingId = ref(null);
const denyingId = ref(null);
const revokingId = ref(null);

const approveModal = ref(null);
const approveDuration = ref('7d');
const approveCustomExpiry = ref('');

const pendingRequests = computed(() => (requests.value || []).filter((r) => String(r.status || '').toLowerCase() === 'pending'));
const activeGrants = computed(() => {
  const now = Date.now();
  return (grants.value || []).filter((g) => {
    const revoked = g.revoked_at != null;
    const expires = g.expires_at ? new Date(g.expires_at).getTime() : null;
    return !revoked && (expires == null || expires > now);
  });
});

const docTitle = (docId) => {
  const d = (docs.value || []).find((x) => Number(x.id) === Number(docId));
  return d?.title || null;
};

const formatPerson = (first, last, email, id) => {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || email || (id ? `User ${id}` : '-');
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-');

const effectiveDocType = computed(() => {
  if (formType.value === '__custom__') return String(formTypeCustom.value || '').trim() || null;
  return String(formType.value || '').trim() || null;
});

const reload = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/users/${props.userId}/admin-docs`, {
      params: {
        includeDeleted: showDeleted.value ? 'true' : 'false'
      }
    });
    docs.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load admin documentation';
  } finally {
    loading.value = false;
  }

  if (isBackoffice.value) {
    await reloadRequests();
    await reloadGrants();
  }
};

const reloadRequests = async () => {
  try {
    requestsLoading.value = true;
    requestsError.value = '';
    const resp = await api.get(`/users/${props.userId}/admin-docs/access-requests`);
    requests.value = resp.data || [];
  } catch (e) {
    requestsError.value = e.response?.data?.error?.message || 'Failed to load access requests';
  } finally {
    requestsLoading.value = false;
  }
};

const reloadGrants = async () => {
  try {
    grantsLoading.value = true;
    grantsError.value = '';
    const resp = await api.get(`/users/${props.userId}/admin-docs/access-grants`);
    grants.value = resp.data || [];
  } catch (e) {
    grantsError.value = e.response?.data?.error?.message || 'Failed to load access grants';
  } finally {
    grantsLoading.value = false;
  }
};

const openAddModal = () => {
  showAdd.value = true;
};

const closeAddModal = () => {
  if (creating.value) return;
  showAdd.value = false;
  formTitle.value = '';
  formType.value = '';
  formTypeCustom.value = '';
  formNoteText.value = '';
  formFile.value = null;
  formFileName.value = '';
};

const onFileChange = (evt) => {
  const f = evt.target?.files?.[0] || null;
  formFile.value = f;
  formFileName.value = f?.name || '';
};

const submitCreate = async () => {
  const title = String(formTitle.value || '').trim();
  if (!title) return alert('Title is required');

  const noteText = String(formNoteText.value || '').trim();
  const docType = effectiveDocType.value;

  if (!formFile.value && !noteText) {
    return alert('Add a note or upload a file.');
  }

  try {
    creating.value = true;
    error.value = '';

    if (formFile.value) {
      const fd = new FormData();
      fd.append('file', formFile.value);
      fd.append('title', title);
      if (docType) fd.append('docType', docType);
      if (noteText) fd.append('noteText', noteText);
      await api.post(`/users/${props.userId}/admin-docs/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } else {
      await api.post(`/users/${props.userId}/admin-docs`, { title, docType, noteText });
    }

    closeAddModal();
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to create entry');
  } finally {
    creating.value = false;
  }
};

const openDoc = async (doc) => {
  if (!doc?.id) return;
  try {
    const resp = await api.get(`/users/${props.userId}/admin-docs/${doc.id}/view`);
    const data = resp.data || {};
    if (data.type === 'note') {
      noteTitle.value = doc.title || 'Note';
      noteText.value = data.noteText || '';
      showNote.value = true;
      return;
    }
    if (data.type === 'file') {
      if (!data.url) throw new Error('Missing URL');
      window.open(data.url, '_blank', 'noopener');
      return;
    }
    throw new Error('Unsupported response');
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to open entry');
  }
};

const requestAccess = async (doc) => {
  if (!doc?.id) return;
  const set = new Set(requestingAccessIds.value);
  set.add(doc.id);
  requestingAccessIds.value = set;
  try {
    await api.post(`/users/${props.userId}/admin-docs/access-requests`, { docId: doc.id });
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to request access');
  } finally {
    const next = new Set(requestingAccessIds.value);
    next.delete(doc.id);
    requestingAccessIds.value = next;
  }
};

const requestProviderAccess = async () => {
  try {
    requestingProviderAccess.value = true;
    await api.post(`/users/${props.userId}/admin-docs/access-requests`, { scope: 'provider' });
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to request access');
  } finally {
    requestingProviderAccess.value = false;
  }
};

const deleteDoc = async (doc) => {
  if (!doc?.id) return;
  const ok = window.confirm(`Delete "${doc.title || 'this entry'}"? It will be hidden from normal view but retained with audit metadata.`);
  if (!ok) return;

  const next = new Set(deletingIds.value);
  next.add(doc.id);
  deletingIds.value = next;

  try {
    await api.delete(`/users/${props.userId}/admin-docs/${doc.id}`);
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete entry');
  } finally {
    const done = new Set(deletingIds.value);
    done.delete(doc.id);
    deletingIds.value = done;
  }
};

const restoreDoc = async (doc) => {
  if (!doc?.id) return;
  const ok = window.confirm(`Restore "${doc.title || 'this entry'}" to active view?`);
  if (!ok) return;

  const next = new Set(restoringIds.value);
  next.add(doc.id);
  restoringIds.value = next;
  try {
    await api.post(`/users/${props.userId}/admin-docs/${doc.id}/restore`, {});
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to restore entry');
  } finally {
    const done = new Set(restoringIds.value);
    done.delete(doc.id);
    restoringIds.value = done;
  }
};

const setLegalHold = async (doc) => {
  if (!doc?.id) return;
  const reason = window.prompt('Legal hold reason (required):', doc.legalHoldReason || '');
  if (reason === null) return;
  const trimmed = String(reason || '').trim();
  if (!trimmed) {
    alert('Legal hold reason is required.');
    return;
  }

  const next = new Set(legalHoldIds.value);
  next.add(doc.id);
  legalHoldIds.value = next;
  try {
    await api.post(`/users/${props.userId}/admin-docs/${doc.id}/legal-hold`, {
      reason: trimmed
    });
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to place legal hold');
  } finally {
    const done = new Set(legalHoldIds.value);
    done.delete(doc.id);
    legalHoldIds.value = done;
  }
};

const releaseLegalHold = async (doc) => {
  if (!doc?.id) return;
  const ok = window.confirm(`Release legal hold for "${doc.title || 'this entry'}"?`);
  if (!ok) return;

  const next = new Set(legalHoldIds.value);
  next.add(doc.id);
  legalHoldIds.value = next;
  try {
    await api.post(`/users/${props.userId}/admin-docs/${doc.id}/legal-hold/release`, {});
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to release legal hold');
  } finally {
    const done = new Set(legalHoldIds.value);
    done.delete(doc.id);
    legalHoldIds.value = done;
  }
};

const openApproveModal = (r) => {
  approveModal.value = r;
  approveDuration.value = '7d';
  approveCustomExpiry.value = '';
};

const approveRequest = async () => {
  const r = approveModal.value;
  if (!r?.id) return;
  try {
    approvingId.value = r.id;
    let expiresAt = null;
    if (approveDuration.value === '24h') expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    else if (approveDuration.value === '7d') expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    else if (approveDuration.value === '30d') expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    else if (approveDuration.value === 'custom') {
      if (!approveCustomExpiry.value) return alert('Choose a custom expiration date/time.');
      expiresAt = new Date(approveCustomExpiry.value).toISOString();
    }

    await api.post(`/users/${props.userId}/admin-docs/access-requests/${r.id}/approve`, { expiresAt });
    approveModal.value = null;
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to approve request');
  } finally {
    approvingId.value = null;
  }
};

const denyRequest = async (r) => {
  if (!r?.id) return;
  try {
    denyingId.value = r.id;
    await api.post(`/users/${props.userId}/admin-docs/access-requests/${r.id}/deny`, {});
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to deny request');
  } finally {
    denyingId.value = null;
  }
};

const revokeGrant = async (g) => {
  if (!g?.id) return;
  try {
    revokingId.value = g.id;
    await api.post(`/users/${props.userId}/admin-docs/access-grants/${g.id}/revoke`, {});
    await reload();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to revoke grant');
  } finally {
    revokingId.value = null;
  }
};

onMounted(reload);
watch(() => props.userId, reload);
watch(showDeleted, reload);
</script>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.hint {
  margin: 6px 0 12px;
  color: var(--text-secondary);
}
.deleted-toggle-row {
  margin: 0 0 12px;
}
.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.loading {
  padding: 12px 0;
  color: var(--text-secondary);
}
.error {
  padding: 10px 0;
  color: var(--danger);
}
.empty {
  padding: 14px 0;
  color: var(--text-secondary);
}
.muted {
  color: var(--text-secondary);
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
  vertical-align: top;
}
.cell-actions { text-align: right; white-space: nowrap; }
.title {
  font-weight: 700;
}
.badge-warning {
  background: #fff3cd;
  color: #856404;
  border-color: #ffe69c;
}
.provider-scope {
  margin-top: 10px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1300;
}
.modal {
  width: 720px;
  max-width: 92vw;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
}
.modal.large {
  width: 860px;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.form-group {
  margin-bottom: 12px;
}
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
}
.input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
}
.textarea {
  resize: vertical;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}
.note-body {
  white-space: pre-wrap;
  background: #fafafa;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  max-height: 70vh;
  overflow: auto;
}
.admin-panel {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
</style>

