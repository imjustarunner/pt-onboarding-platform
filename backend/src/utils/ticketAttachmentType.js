// Only recognize passive preview formats from the actual bytes. Never promote
// HTML/SVG or an arbitrary sender-provided MIME type to an inline document.
export function ticketAttachmentType(buffer, filename = 'attachment') {
  const name = String(filename || 'attachment').replace(/[\r\n"\\/]/g, '_');
  let type = null;
  if (buffer?.subarray(0, 5).toString('ascii') === '%PDF-') type = ['application/pdf', '.pdf'];
  else if (buffer?.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type = ['image/png', '.png'];
  else if (buffer?.[0] === 255 && buffer?.[1] === 216 && buffer?.[2] === 255) type = ['image/jpeg', '.jpg'];
  if (!type) return { filename: name, mimeType: 'application/octet-stream', disposition: 'attachment' };
  return { filename: name.toLowerCase().endsWith(type[1]) ? name : `${name}${type[1]}`, mimeType: type[0], disposition: 'inline' };
}
