import { ImageAnnotatorClient } from '@google-cloud/vision';
import dommatrixPkg from 'dommatrix';

let visionClient = null;

function getVisionClient() {
  if (!visionClient) {
    visionClient = new ImageAnnotatorClient();
  }
  return visionClient;
}

class ReferralOcrService {
  static async extractText({ buffer, mimeType }) {
    if (typeof globalThis.DOMMatrix === 'undefined') {
      const { DOMMatrix } = dommatrixPkg || {};
      if (DOMMatrix) {
        globalThis.DOMMatrix = DOMMatrix;
      }
    }
    const type = String(mimeType || '').toLowerCase();
    if (type.includes('pdf')) {
      const pdfParseModule = await import('pdf-parse');
      const pdfParseFn = pdfParseModule.default?.default || pdfParseModule.default || pdfParseModule;
      const result = await pdfParseFn(buffer);
      return result.text || '';
    }
    const [res] = await getVisionClient().textDetection(buffer);
    const text = res?.fullTextAnnotation?.text || res?.textAnnotations?.[0]?.description || '';
    return text || '';
  }
}

export default ReferralOcrService;
