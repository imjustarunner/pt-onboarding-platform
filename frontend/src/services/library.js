import api from './api';

const base = '/library';

export async function fetchLibraryHome(params = {}) {
  const { data } = await api.get(`${base}/home`, { params });
  return data;
}

export async function fetchLibraryResources(params = {}) {
  const { data } = await api.get(`${base}/resources`, { params });
  return data;
}

export async function fetchLibraryResource(id, params = {}) {
  const { data } = await api.get(`${base}/resources/${id}`, { params });
  return data;
}

export async function uploadLibraryResource(formData) {
  const { data } = await api.post(`${base}/resources/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

export async function uploadLibraryBatch(formData) {
  const { data } = await api.post(`${base}/resources/upload-batch`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

export async function suggestLibraryMetadata(formDataOrPayload) {
  const isFd = typeof FormData !== 'undefined' && formDataOrPayload instanceof FormData;
  const { data } = await api.post(
    `${base}/resources/suggest-metadata`,
    formDataOrPayload,
    isFd ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
  );
  return data;
}

export async function createLibraryBrandedDoc(payload) {
  const { data } = await api.post(`${base}/resources/branded`, payload);
  return data;
}

export async function fetchLibraryLetterheads(params = {}) {
  const { data } = await api.get(`${base}/letterheads`, { params });
  return data;
}

export function libraryBrandedDocPdfUrl(id) {
  return `/api/library/resources/${id}/pdf`;
}

export async function addLibraryLink(payload) {
  const { data } = await api.post(`${base}/resources/link`, payload);
  return data;
}

export async function updateLibraryResource(id, payload) {
  const { data } = await api.patch(`${base}/resources/${id}`, payload, { skipGlobalLoading: true });
  return data;
}

export async function archiveLibraryResource(id, agencyId) {
  const { data } = await api.post(`${base}/resources/${id}/archive`, { agencyId });
  return data;
}

export async function deleteLibraryResource(id) {
  const { data } = await api.delete(`${base}/resources/${id}`);
  return data;
}

export async function downloadLibraryResource(id) {
  const { data } = await api.get(`${base}/resources/${id}/download`);
  return data;
}

export async function fetchLibraryCategories(params = {}) {
  const { data } = await api.get(`${base}/categories`, { params });
  return data;
}

export async function updateLibraryCategory(id, payload) {
  const { data } = await api.patch(`${base}/categories/${id}`, payload);
  return data;
}

export async function fetchLibraryFolders(params = {}) {
  const { data } = await api.get(`${base}/folders`, { params });
  return data;
}

export async function createLibraryFolder(payload) {
  const { data } = await api.post(`${base}/folders`, payload);
  return data;
}

export async function updateLibraryFolder(id, payload) {
  const { data } = await api.patch(`${base}/folders/${id}`, payload);
  return data;
}

export async function fetchLibraryTags(params = {}) {
  const { data } = await api.get(`${base}/tags`, { params });
  return data;
}

export async function fetchLibraryFavorites(params = {}) {
  const { data } = await api.get(`${base}/favorites`, { params });
  return data;
}

export async function addLibraryFavorite(resourceId, agencyId) {
  const { data } = await api.post(`${base}/favorites/${resourceId}`, { agencyId });
  return data;
}

export async function removeLibraryFavorite(resourceId, agencyId) {
  const { data } = await api.delete(`${base}/favorites/${resourceId}`, { params: { agencyId } });
  return data;
}

export async function fetchLibraryRecent(params = {}) {
  const { data } = await api.get(`${base}/recent`, { params });
  return data;
}

export async function fetchFolderShares(folderId, agencyId) {
  const { data } = await api.get(`${base}/folders/${folderId}/shares`, { params: { agencyId } });
  return data;
}

export async function setFolderShares(folderId, payload) {
  const { data } = await api.put(`${base}/folders/${folderId}/shares`, payload);
  return data;
}

export async function fetchResourceShares(resourceId) {
  const { data } = await api.get(`${base}/resources/${resourceId}/shares`);
  return data;
}

export async function setResourceShares(resourceId, payload) {
  const { data } = await api.put(`${base}/resources/${resourceId}/shares`, payload);
  return data;
}

export async function distributeLibraryResource(resourceId, payload) {
  const { data } = await api.post(`${base}/resources/${resourceId}/distribute`, payload);
  return data;
}

export async function fetchMyLibraryCopies(params = {}) {
  const { data } = await api.get(`${base}/my-copies`, { params });
  return data;
}

export async function previewLibraryDocument(payload) {
  const { data } = await api.post(`${base}/documents/preview`, payload, { responseType: 'blob', skipGlobalLoading: true });
  return data;
}

export async function copyLibraryDocument(id, payload = {}) {
  const { data } = await api.post(`${base}/resources/${id}/copy`, payload);
  return data;
}

export async function exportLibraryDocument(id, format, agencyId) {
  const { data } = await api.get(`${base}/resources/${id}/${format}`, { params: { agencyId }, responseType: 'blob' });
  return data;
}

export async function fetchLibraryFileContent(id, agencyId, signal) {
  const { data } = await api.get(`${base}/resources/${id}/file-content`, {
    params: { agencyId }, responseType: 'blob', skipGlobalLoading: true, timeout: 240000, signal
  });
  return data;
}

export async function fetchLibraryGooglePreview(id, agencyId, signal) {
  try {
    const { data } = await api.get(`${base}/resources/${id}/google-preview`, {
      params: { agencyId }, responseType: 'blob', skipGlobalLoading: true, timeout: 120000, signal
    });
    return data;
  } catch (error) {
    if (typeof error.response?.data?.text === 'function') {
      try {
        const detail = JSON.parse(await error.response.data.text());
        if (detail.error?.message) error.message = detail.error.message;
      } catch { /* Keep the request error if no JSON error is available. */ }
    }
    throw error;
  }
}

export async function fetchLibraryPdf(id, agencyId, signal) {
  try {
    const { data } = await api.get(`${base}/resources/${id}/pdf-content`, {
      params: { agencyId }, responseType: 'blob', skipGlobalLoading: true, signal
    });
    return data;
  } catch (error) {
    if (typeof error.response?.data?.text === 'function') {
      try { error.message = JSON.parse(await error.response.data.text()).error?.message || error.message; } catch { /* Keep request error. */ }
    }
    throw error;
  }
}

export async function saveLibraryPdfCopy(id, payload) {
  const { data } = await api.post(`${base}/resources/${id}/filled-copy`, payload, { skipGlobalLoading: true });
  return data;
}
