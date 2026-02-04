import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../services/api';

export const useDocumentsStore = defineStore('documents', () => {
  const templates = ref([]);
  const signedDocuments = ref([]);
  const loading = ref(false);
  const error = ref('');

  const pagination = ref({
    total: 0,
    limit: 20,
    offset: 0,
    totalPages: 1,
    currentPage: 1
  });

  const fetchTemplates = async (filters = {}) => {
    try {
      loading.value = true;
      error.value = '';
      
      const params = new URLSearchParams();
      console.log('documents store - fetchTemplates - filters.agencyId:', filters.agencyId, 'type:', typeof filters.agencyId);
      if (filters.agencyId !== undefined) {
        // Send 'null' as string when agencyId is null (for platform templates)
        const agencyIdParam = filters.agencyId === null ? 'null' : filters.agencyId;
        params.append('agencyId', agencyIdParam);
        console.log('documents store - Appending agencyId to params:', agencyIdParam);
      }
      console.log('documents store - Final query string:', params.toString());
      if (filters.documentType) params.append('documentType', filters.documentType);
      if (filters.isUserSpecific !== undefined) params.append('isUserSpecific', filters.isUserSpecific);
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.isActive !== undefined) params.append('isActive', filters.isActive.toString());
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
      
      const queryString = params.toString();
      const response = await api.get(`/document-templates${queryString ? '?' + queryString : ''}`);
      
      // Handle paginated response
      if (response.data.data) {
        templates.value = response.data.data;
        pagination.value = {
          total: response.data.total,
          limit: response.data.limit,
          offset: response.data.offset,
          totalPages: response.data.totalPages,
          currentPage: response.data.currentPage
        };
      } else {
        // Backward compatibility - non-paginated response
        templates.value = response.data;
        pagination.value = {
          total: response.data.length,
          limit: response.data.length,
          offset: 0,
          totalPages: 1,
          currentPage: 1
        };
      }
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to fetch templates';
      console.error('Error fetching templates:', err);
    } finally {
      loading.value = false;
    }
  };

  const uploadTemplate = async (formData) => {
    try {
      loading.value = true;
      error.value = '';
      // NOTE: do not set Content-Type manually for FormData; browser must include boundary
      const response = await api.post('/document-templates/upload', formData);
      await fetchTemplates();
      return response.data;
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to upload template';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createTemplate = async (templateData) => {
    try {
      loading.value = true;
      error.value = '';
      const response = await api.post('/document-templates', templateData);
      await fetchTemplates();
      return response.data;
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to create template';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const signDocument = async (taskId, signatureData, fieldValues = null) => {
    try {
      loading.value = true;
      error.value = '';
      const response = await api.post(`/document-signing/${taskId}/sign`, {
        signatureData,
        fieldValues
      });
      return response.data;
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to sign document';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const finalizeAcroformI9 = async (taskId, wizardData, signatureData) => {
    try {
      loading.value = true;
      error.value = '';
      const response = await api.post(`/document-signing/${taskId}/acroform/i9/finalize`, {
        wizardData,
        signatureData
      });
      return response.data;
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to finalize I-9';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const counterSignDocument = async (taskId, signatureData) => {
    try {
      loading.value = true;
      error.value = '';
      const response = await api.post(`/document-signing/${taskId}/countersign`, {
        signatureData
      });
      return response.data;
    } catch (err) {
      error.value = err.response?.data?.error?.message || 'Failed to countersign document';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const downloadSignedDocument = async (taskId, filename = null) => {
    try {
      const response = await api.get(`/document-signing/${taskId}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename || `signed-document-${taskId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('downloadSignedDocument: Error:', err);
      console.error('downloadSignedDocument: Error response:', err.response);
      const errorData = err.response?.data?.error || {};
      
      // Handle 400 error (document not finalized) specially
      if (err.response?.status === 400 && errorData.status === 'not_finalized') {
        error.value = 'Document has not been finalized yet. Please complete the signature process first.';
        throw new Error('Document not finalized');
      }
      
      // Try to parse error message from blob response if it's not JSON
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const jsonError = JSON.parse(text);
          error.value = jsonError.error?.message || 'Failed to download document';
        } catch {
          error.value = errorData.message || 'Failed to download document';
        }
      } else {
        error.value = errorData.message || 'Failed to download document';
      }
      throw err;
    }
  };

  return {
    templates,
    signedDocuments,
    loading,
    error,
    pagination,
    fetchTemplates,
    uploadTemplate,
    createTemplate,
    signDocument,
    counterSignDocument,
    finalizeAcroformI9,
    downloadSignedDocument
  };
});

