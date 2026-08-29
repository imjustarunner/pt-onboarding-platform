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

export async function addLibraryLink(payload) {
  const { data } = await api.post(`${base}/resources/link`, payload);
  return data;
}

export async function updateLibraryResource(id, payload) {
  const { data } = await api.patch(`${base}/resources/${id}`, payload);
  return data;
}

export async function archiveLibraryResource(id) {
  const { data } = await api.post(`${base}/resources/${id}/archive`);
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

export async function addLibraryFavorite(resourceId) {
  const { data } = await api.post(`${base}/favorites/${resourceId}`);
  return data;
}

export async function removeLibraryFavorite(resourceId) {
  const { data } = await api.delete(`${base}/favorites/${resourceId}`);
  return data;
}

export async function fetchLibraryRecent(params = {}) {
  const { data } = await api.get(`${base}/recent`, { params });
  return data;
}

export async function fetchFolderShares(folderId) {
  const { data } = await api.get(`${base}/folders/${folderId}/shares`);
  return data;
}

export async function setFolderShares(folderId, payload) {
  const { data } = await api.put(`${base}/folders/${folderId}/shares`, payload);
  return data;
}
