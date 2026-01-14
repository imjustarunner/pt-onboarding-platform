import { PDFDocument } from 'pdf-lib';
import DocumentSigningService from '../documentSigning.service.js';
import StorageService from '../storage.service.js';

/**
 * I-9 AcroForm automation
 *
 * This fills an admin-uploaded official I-9 PDF (AcroForm), flattens it,
 * embeds a captured signature image, and appends an audit certificate page.
 *
 * NOTE: AcroForm field names vary by I-9 PDF version. This service attempts
 * best-effort mapping with multiple candidate field names per value. For robust
 * mapping, use the optional field discovery endpoint (returns actual field names).
 */
class I9AcroformService {
  static _templateFilenameFromPath(templatePath) {
    if (!templatePath) return null;
    // Stored as "templates/<filename>.pdf" in DB
    const parts = String(templatePath).split('/');
    return parts[parts.length - 1];
  }

  static listAcroFormFields(pdfBytes) {
    return PDFDocument.load(pdfBytes).then((pdfDoc) => {
      const form = pdfDoc.getForm();
      return form.getFields().map((f) => ({
        name: f.getName(),
        type: f.constructor?.name || 'Unknown'
      }));
    });
  }

  static _tryGetField(form, getter, name) {
    try {
      return form[getter](name);
    } catch {
      return null;
    }
  }

  static _trySetText(form, candidateNames, value) {
    if (value === undefined || value === null) return false;
    const str = String(value);
    for (const name of candidateNames) {
      const field = this._tryGetField(form, 'getTextField', name);
      if (field) {
        field.setText(str);
        return true;
      }
    }
    return false;
  }

  static _trySetCheckbox(form, candidateNames, checked) {
    if (checked === undefined || checked === null) return false;
    const bool = !!checked;
    for (const name of candidateNames) {
      const field = this._tryGetField(form, 'getCheckBox', name);
      if (field) {
        if (bool) field.check();
        else field.uncheck();
        return true;
      }
    }
    return false;
  }

  /**
   * Generate finalized I-9 PDF bytes.
   *
   * @param {object} params
   * @param {string} params.templatePath - DocumentTemplate.file_path (GCS key like "templates/foo.pdf")
   * @param {object} params.wizardData - Wizard answers
   * @param {string} params.signatureData - data URL (png/jpg)
   * @param {object|null} params.signatureCoords - {x,y,width,height,page}
   * @param {object} params.workflowData - workflow info for audit certificate
   * @param {object} params.userData - {firstName,lastName,email,userId}
   * @param {object} params.auditTrail - existing audit data
   * @returns {Promise<{pdfBytes: Uint8Array, pdfHash: string, fieldWriteSummary: object}>}
   */
  static async generateFinalizedI9({
    templatePath,
    wizardData,
    signatureData,
    signatureCoords,
    workflowData,
    userData,
    auditTrail
  }) {
    const filename = this._templateFilenameFromPath(templatePath);
    if (!filename) {
      throw new Error('I9AcroformService: templatePath is required');
    }

    const templateBuffer = await StorageService.readTemplate(filename);
    const pdfDoc = await PDFDocument.load(templateBuffer);
    const form = pdfDoc.getForm();

    // Best-effort mapping for common I-9 fields (Section 1)
    // These names may differ across I-9 versions; candidates are tried in order.
    const fieldWriteSummary = {};
    const wrote = (key, ok) => { fieldWriteSummary[key] = ok; };

    wrote('employeeLastName', this._trySetText(form, ['Last Name (Family Name)', 'LastName', 'last_name', 'EmployeeLastName'], wizardData.employeeLastName));
    wrote('employeeFirstName', this._trySetText(form, ['First Name (Given Name)', 'FirstName', 'first_name', 'EmployeeFirstName'], wizardData.employeeFirstName));
    wrote('employeeMiddleInitial', this._trySetText(form, ['Middle Initial', 'MiddleInitial', 'middle_initial'], wizardData.employeeMiddleInitial));
    wrote('employeeOtherLastNames', this._trySetText(form, ['Other Last Names Used (if any)', 'OtherLastNames', 'other_last_names'], wizardData.employeeOtherLastNames));

    wrote('addressStreet', this._trySetText(form, ['Address (Street Number and Name)', 'Address', 'address'], wizardData.addressStreet));
    wrote('addressApt', this._trySetText(form, ['Apt. Number', 'AptNumber', 'apt'], wizardData.addressApt));
    wrote('addressCity', this._trySetText(form, ['City or Town', 'City', 'city'], wizardData.addressCity));
    wrote('addressState', this._trySetText(form, ['State', 'state'], wizardData.addressState));
    wrote('addressZip', this._trySetText(form, ['ZIP Code', 'Zip', 'zip'], wizardData.addressZip));

    wrote('dateOfBirth', this._trySetText(form, ['Date of Birth (mm/dd/yyyy)', 'DOB', 'date_of_birth'], wizardData.dateOfBirth));
    wrote('ssn', this._trySetText(form, ['U.S. Social Security Number', 'SSN', 'ssn'], wizardData.ssn));
    wrote('email', this._trySetText(form, ['Employee Email Address', 'Email', 'email'], wizardData.email));
    wrote('phone', this._trySetText(form, ['Employee Telephone Number', 'Phone', 'telephone'], wizardData.phone));

    // Citizenship/immigration status (checkboxes/radios differ wildly; we do best-effort)
    // wizardData.citizenshipStatus: 'citizen'|'noncitizen_national'|'permanent_resident'|'authorized_alien'
    const status = wizardData.citizenshipStatus;
    wrote('statusCitizen', this._trySetCheckbox(form, ['A citizen of the United States', 'Citizen', 'status_citizen'], status === 'citizen'));
    wrote('statusNoncitizenNational', this._trySetCheckbox(form, ['A noncitizen national of the United States', 'NoncitizenNational', 'status_noncitizen_national'], status === 'noncitizen_national'));
    wrote('statusPermanentResident', this._trySetCheckbox(form, ['A lawful permanent resident', 'PermanentResident', 'status_permanent_resident'], status === 'permanent_resident'));
    wrote('statusAuthorizedAlien', this._trySetCheckbox(form, ['An alien authorized to work', 'AuthorizedAlien', 'status_authorized_alien'], status === 'authorized_alien'));

    // Flatten to lock fields
    try {
      form.flatten();
    } catch (e) {
      // Some PDFs may not support flattening cleanly; still proceed with signature/certificate.
      // Leaving form editable is not ideal, but better than failing the workflow.
      // Field discovery + correct template choice should avoid this.
      // eslint-disable-next-line no-console
      console.warn('I9AcroformService: failed to flatten form:', e?.message || e);
    }

    // Embed signature image and append audit certificate page
    if (signatureData) {
      await DocumentSigningService.addSignatureToPDF(pdfDoc, signatureData, signatureCoords);
    }

    const audit = {
      ...(auditTrail || {}),
      acroform: {
        type: 'i9',
        fieldWriteSummary
      }
    };

    await DocumentSigningService.addAuditCertificatePage(pdfDoc, workflowData, userData, audit);
    const pdfBytes = await pdfDoc.save();
    const pdfHash = DocumentSigningService.calculatePDFHash(pdfBytes);

    return { pdfBytes, pdfHash, fieldWriteSummary };
  }
}

export default I9AcroformService;

