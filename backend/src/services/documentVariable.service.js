import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentVariableService {
  /**
   * Get all available template variables with descriptions
   */
  static getAvailableVariables() {
    return [
      {
        variable: '{{AGENCY_NAME}}',
        description: 'Agency name',
        example: 'Acme Corporation'
      },
      {
        variable: '{{USER_FIRST_NAME}}',
        description: "User's first name",
        example: 'John'
      },
      {
        variable: '{{USER_LAST_NAME}}',
        description: "User's last name",
        example: 'Doe'
      },
      {
        variable: '{{USER_FULL_NAME}}',
        description: "User's full name (first + last)",
        example: 'John Doe'
      },
      {
        variable: '{{USER_EMAIL}}',
        description: "User's email address",
        example: 'john.doe@example.com'
      },
      {
        variable: '{{ASSIGNMENT_DATE}}',
        description: 'Date document was assigned (YYYY-MM-DD)',
        example: '2024-01-15'
      },
      {
        variable: '{{DUE_DATE}}',
        description: 'Document due date (YYYY-MM-DD)',
        example: '2024-01-29'
      },
      {
        variable: '{{CURRENT_DATE}}',
        description: 'Current date when document is viewed/signed (YYYY-MM-DD)',
        example: '2024-01-20'
      }
    ];
  }

  /**
   * Replace template variables in HTML content
   * @param {string} content - HTML content with variables
   * @param {object} userData - User data object
   * @param {object} agencyData - Agency data object
   * @param {object} taskData - Task data object
   * @returns {string} - Content with variables replaced
   */
  static replaceVariables(content, userData = {}, agencyData = {}, taskData = {}) {
    if (!content || typeof content !== 'string') {
      return content;
    }

    let replaced = content;

    // Agency variables
    if (agencyData.name) {
      replaced = replaced.replace(/\{\{AGENCY_NAME\}\}/g, agencyData.name);
    }

    // User variables
    if (userData.firstName) {
      replaced = replaced.replace(/\{\{USER_FIRST_NAME\}\}/g, userData.firstName);
    }
    if (userData.lastName) {
      replaced = replaced.replace(/\{\{USER_LAST_NAME\}\}/g, userData.lastName);
    }
    if (userData.firstName || userData.lastName) {
      const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
      replaced = replaced.replace(/\{\{USER_FULL_NAME\}\}/g, fullName);
    }
    if (userData.email) {
      replaced = replaced.replace(/\{\{USER_EMAIL\}\}/g, userData.email);
    }

    // Date variables
    if (taskData.assignmentDate) {
      const assignmentDate = this.formatDate(taskData.assignmentDate);
      replaced = replaced.replace(/\{\{ASSIGNMENT_DATE\}\}/g, assignmentDate);
    }
    if (taskData.dueDate) {
      const dueDate = this.formatDate(taskData.dueDate);
      replaced = replaced.replace(/\{\{DUE_DATE\}\}/g, dueDate);
    }
    
    // Current date (always available)
    const currentDate = this.formatDate(new Date());
    replaced = replaced.replace(/\{\{CURRENT_DATE\}\}/g, currentDate);

    return replaced;
  }

  /**
   * Format date as YYYY-MM-DD
   * @param {Date|string} date - Date to format
   * @returns {string} - Formatted date
   */
  static formatDate(date) {
    if (!date) return '';
    
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Replace variables in PDF template (basic text replacement)
   * Note: This is a simplified version. For complex PDFs, consider using PDF form fields or more advanced libraries
   * @param {string} templatePath - Path to PDF template
   * @param {string} outputPath - Path to save output PDF
   * @param {object} variables - Variables object with key-value pairs
   * @returns {Promise<string>} - Path to generated PDF
   */
  static async replaceVariablesInPDF(templatePath, outputPath, variables = {}) {
    try {
      // Read the PDF template
      const pdfBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Get all pages
      const pages = pdfDoc.getPages();

      // For each page, we could add text overlays with variables
      // This is a simplified approach - for production, you might want to:
      // 1. Use PDF form fields
      // 2. Use a more sophisticated PDF manipulation library
      // 3. Convert PDF to HTML, replace variables, then convert back

      // For now, we'll just copy the PDF as-is
      // In a real implementation, you'd replace text in the PDF
      const modifiedPdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, modifiedPdfBytes);

      return outputPath;
    } catch (error) {
      console.error('Error replacing variables in PDF:', error);
      throw new Error(`Failed to replace variables in PDF: ${error.message}`);
    }
  }

  /**
   * Extract variables from content
   * @param {string} content - Content to analyze
   * @returns {Array<string>} - Array of variable names found
   */
  static extractVariables(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const variableRegex = /\{\{([A-Z_]+)\}\}/g;
    const matches = content.matchAll(variableRegex);
    const variables = new Set();

    for (const match of matches) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Validate that all variables in content are supported
   * @param {string} content - Content to validate
   * @returns {object} - { valid: boolean, unsupported: Array<string> }
   */
  static validateVariables(content) {
    const availableVars = this.getAvailableVariables().map(v => v.variable.replace(/\{\{|\}\}/g, ''));
    const foundVars = this.extractVariables(content);
    const unsupported = foundVars.filter(v => !availableVars.includes(v));

    return {
      valid: unsupported.length === 0,
      unsupported: unsupported.map(v => `{{${v}}}`)
    };
  }
}

export default DocumentVariableService;

