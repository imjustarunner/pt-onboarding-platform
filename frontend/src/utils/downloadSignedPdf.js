export function downloadSignedPdf(blob) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='signed-document.pdf';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
