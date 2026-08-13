import QRCode from 'qrcode';

/**
 * Branded QR (gradient modules + optional center logo) plus a plain black fallback.
 */
export async function buildFancyQrDataUrl(url, { size = 300, logoSrc = '' } = {}) {
  const simple = await QRCode.toDataURL(url, { width: size, margin: 2 });

  try {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    await new Promise((res, rej) => {
      QRCode.toCanvas(tempCanvas, url, { width: size, margin: 2 }, (err) => (err ? rej(err) : res()));
    });
    const tCtx = tempCanvas.getContext('2d');
    const img = tCtx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] > 180 && img.data[i + 1] > 180 && img.data[i + 2] > 180) img.data[i + 3] = 0;
    }
    tCtx.putImageData(img, 0, 0);

    const gL = document.createElement('canvas');
    gL.width = size;
    gL.height = size;
    const gCtx = gL.getContext('2d');
    const grad = gCtx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#14b8a6');
    grad.addColorStop(0.5, '#22c55e');
    grad.addColorStop(1, '#eab308');
    gCtx.fillStyle = grad;
    gCtx.fillRect(0, 0, size, size);
    gCtx.globalCompositeOperation = 'destination-in';
    gCtx.drawImage(tempCanvas, 0, 0);

    const fin = document.createElement('canvas');
    fin.width = size;
    fin.height = size;
    const fCtx = fin.getContext('2d');
    fCtx.fillStyle = '#ffffff';
    fCtx.fillRect(0, 0, size, size);
    fCtx.drawImage(gL, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const logoR = 26;
    fCtx.beginPath();
    fCtx.arc(cx, cy, logoR + 6, 0, Math.PI * 2);
    fCtx.fillStyle = '#ffffff';
    fCtx.fill();
    if (logoSrc) {
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.src = logoSrc;
      await new Promise((r) => {
        logo.onload = r;
        logo.onerror = r;
      });
      if (logo.width) {
        fCtx.save();
        fCtx.beginPath();
        fCtx.arc(cx, cy, logoR, 0, Math.PI * 2);
        fCtx.clip();
        fCtx.drawImage(logo, cx - logoR, cy - logoR, logoR * 2, logoR * 2);
        fCtx.restore();
      }
    }
    return { simple, fancy: fin.toDataURL('image/png') };
  } catch {
    return { simple, fancy: simple };
  }
}
