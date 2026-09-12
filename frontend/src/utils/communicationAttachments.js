import api from '../services/api';

export async function downloadAttachment(path, filename) {
  const { data } = await api.get(path, { responseType: 'blob', skipGlobalLoading: true });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'attachment';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function encodeEmailFiles(files) {
  const list = [...files];
  if (list.reduce((n, file) => n + file.size, 0) > 25 * 1024 * 1024) throw new Error('Attachments must total 25 MB or less.');
  return Promise.all(list.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve({ filename: file.name, contentType: file.type || 'application/octet-stream', contentBase64: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  })));
}
