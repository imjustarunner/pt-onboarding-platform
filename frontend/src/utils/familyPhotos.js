// Resize in the browser so camera photos upload quickly and lose embedded EXIF metadata.
export async function resizeFamilyPhoto(file, { maxEdge = 1920, maxDataLength = 1800000 } = {}) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose JPEG, PNG or WebP photos.');
  if (file.size > 25000000) throw new Error('Choose photos smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1,maxEdge/Math.max(image.width,image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width*scale); canvas.height = Math.round(image.height*scale);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [.82,.6,.45]) {
      const data = canvas.toDataURL('image/jpeg',quality);
      if (data.length <= maxDataLength) return data;
    }
    throw new Error('This photo is too large. Try a smaller copy.');
  } finally { URL.revokeObjectURL(url); }
}
