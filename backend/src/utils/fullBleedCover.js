/**
 * Letter-size cover art should fill the page with no margin or letterbox.
 * Used only on packet/intake cover pages — body pages keep their chrome margins.
 */

export const LETTER_PAGE_PT = { width: 612, height: 792 };

export function fullBleedCoverRect(imgW, imgH, pageW = LETTER_PAGE_PT.width, pageH = LETTER_PAGE_PT.height) {
  const width = Number(imgW) || 0;
  const height = Number(imgH) || 0;
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0, width: pageW, height: pageH };
  }
  const scale = Math.max(pageW / width, pageH / height);
  const w = width * scale;
  const h = height * scale;
  return {
    x: (pageW - w) / 2,
    y: (pageH - h) / 2,
    width: w,
    height: h
  };
}

export function drawFullBleedCoverImage(page, image, pageW = LETTER_PAGE_PT.width, pageH = LETTER_PAGE_PT.height) {
  if (!page || !image) return;
  const rect = fullBleedCoverRect(image.width, image.height, pageW, pageH);
  page.drawImage(image, rect);
}
