/**
 * Google Docs Service
 * Handles downloading Google Docs as PDF for use as certificate templates
 */

import axios from 'axios';
import https from 'https';

class GoogleDocsService {
  /**
   * Convert Google Doc share URL to PDF export URL
   * Handles various Google Docs URL formats:
   * - https://docs.google.com/document/d/{id}/edit
   * - https://docs.google.com/document/d/{id}/edit?usp=sharing
   * - https://docs.google.com/document/d/{id}
   * 
   * @param {string} docUrl - Google Doc share URL
   * @returns {string} PDF export URL
   */
  static convertToPDFUrl(docUrl) {
    if (!docUrl || typeof docUrl !== 'string') {
      throw new Error('Invalid Google Doc URL');
    }

    // Extract document ID from URL
    const idMatch = docUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch || !idMatch[1]) {
      throw new Error('Could not extract document ID from Google Doc URL');
    }

    const documentId = idMatch[1];
    
    // Convert to PDF export URL
    // Note: This requires the document to be publicly accessible or shared with the service account
    return `https://docs.google.com/document/d/${documentId}/export?format=pdf`;
  }

  /**
   * Download Google Doc as PDF
   * 
   * @param {string} docUrl - Google Doc share URL
   * @returns {Promise<Buffer>} PDF file buffer
   */
  static async downloadGoogleDocAsPDF(docUrl) {
    try {
      const pdfUrl = this.convertToPDFUrl(docUrl);
      
      // Download the PDF
      // Note: For private documents, you would need to use Google API with authentication
      // For now, we assume the document is publicly accessible or shared appropriately
      const response = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        // Allow redirects
        maxRedirects: 5,
        // Handle SSL issues if needed
        httpsAgent: new https.Agent({
          rejectUnauthorized: true
        })
      });

      if (response.status !== 200) {
        throw new Error(`Failed to download Google Doc: HTTP ${response.status}`);
      }

      // Convert arraybuffer to Buffer
      return Buffer.from(response.data);
    } catch (error) {
      if (error.response) {
        // HTTP error response
        if (error.response.status === 403) {
          throw new Error('Google Doc is not publicly accessible. Please ensure the document is shared with "Anyone with the link" or make it public.');
        } else if (error.response.status === 404) {
          throw new Error('Google Doc not found. Please check the URL.');
        } else {
          throw new Error(`Failed to download Google Doc: HTTP ${error.response.status}`);
        }
      } else if (error.request) {
        // Request made but no response
        throw new Error('Failed to connect to Google Docs. Please check your internet connection and the document URL.');
      } else {
        // Error in request setup
        throw new Error(`Error downloading Google Doc: ${error.message}`);
      }
    }
  }

  /**
   * Validate Google Doc URL format
   * 
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid Google Doc URL
   */
  static isValidGoogleDocUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Check if it's a Google Docs URL
    const googleDocsPattern = /^https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9-_]+/;
    return googleDocsPattern.test(url);
  }
}

export default GoogleDocsService;

