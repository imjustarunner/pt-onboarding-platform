export async function viewCredentialingFile(transport, path) {
  const viewer = window.open('', '_blank');
  if (!viewer) throw new Error('Allow a new tab to view this credentialing document.');
  viewer.opener = null;
  viewer.document.title = 'Loading secure credentialing document';
  viewer.document.body.textContent = 'Loading secure document…';
  try {
    const { data } = await transport.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    viewer.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { viewer.close(); throw error; }
}
