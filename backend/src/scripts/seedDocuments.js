import pool from '../config/database.js';

async function seedDocuments() {
  try {
    console.log('🌱 Seeding example documents...');

    // Get super admin user ID (or first admin)
    const [adminRows] = await pool.execute(
      "SELECT id FROM users WHERE role IN ('super_admin', 'admin') ORDER BY role = 'super_admin' DESC LIMIT 1"
    );
    
    if (adminRows.length === 0) {
      console.error('❌ No admin user found. Please create an admin user first.');
      return;
    }
    
    const createdByUserId = adminRows[0].id;
    console.log(`Using user ID ${createdByUserId} as creator`);

    // Example documents for onboarding/training platform
    const exampleDocuments = [
      {
        name: 'Employee Handbook Acknowledgment',
        description: 'Acknowledgment that the employee has received and reviewed the employee handbook',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Employee Handbook Acknowledgment</h1>
            <p style="margin-top: 30px;">I acknowledge that I have received a copy of the Employee Handbook and understand that it is my responsibility to read and familiarize myself with its contents.</p>
            <p>I understand that the policies, procedures, and benefits described in the handbook are subject to change at the discretion of the organization.</p>
            <p style="margin-top: 20px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 30px;">By signing below, I acknowledge that I have read and understand the Employee Handbook.</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'acknowledgment',
        agency_id: null, // Platform-wide
        is_user_specific: false
      },
      {
        name: 'HIPAA Privacy Authorization',
        description: 'Authorization for use and disclosure of protected health information',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">HIPAA Privacy Authorization</h1>
            <p style="margin-top: 30px;">I authorize the use and disclosure of my protected health information (PHI) as described below:</p>
            <p><strong>Purpose of Disclosure:</strong> Treatment, payment, and healthcare operations</p>
            <p><strong>Information to be Disclosed:</strong> All health information necessary for the purposes stated above</p>
            <p style="margin-top: 20px;">I understand that I have the right to revoke this authorization at any time, except to the extent that action has already been taken in reliance on this authorization.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'authorization',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Code of Conduct Agreement',
        description: 'Agreement to abide by the organization\'s code of conduct and ethical standards',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Code of Conduct Agreement</h1>
            <p style="margin-top: 30px;">I acknowledge that I have read and understand the organization's Code of Conduct. I agree to:</p>
            <ul style="line-height: 1.8;">
              <li>Maintain the highest standards of professional conduct</li>
              <li>Treat all clients, colleagues, and stakeholders with respect and dignity</li>
              <li>Maintain confidentiality of client information</li>
              <li>Report any violations of the code of conduct</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'agreement',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Background Check Consent',
        description: 'Consent for background check and verification of credentials',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Background Check Consent Form</h1>
            <p style="margin-top: 30px;">I hereby authorize the organization to conduct a background check, which may include:</p>
            <ul style="line-height: 1.8;">
              <li>Criminal history check</li>
              <li>Employment verification</li>
              <li>Education verification</li>
              <li>Professional license verification</li>
              <li>Reference checks</li>
            </ul>
            <p style="margin-top: 20px;">I understand that this information will be used solely for employment purposes and will be kept confidential.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Social Security Number (Last 4 digits):</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'consent',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Mandatory Reporter Disclosure',
        description: 'Disclosure of mandatory reporting requirements for child and vulnerable adult protection',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Mandatory Reporter Disclosure</h1>
            <p style="margin-top: 30px;">I acknowledge that I have been informed of my legal obligations as a mandatory reporter. I understand that:</p>
            <ul style="line-height: 1.8;">
              <li>I am required by law to report suspected child abuse or neglect</li>
              <li>I am required to report suspected abuse of vulnerable adults</li>
              <li>Failure to report may result in criminal penalties</li>
              <li>I must report immediately when I have reasonable cause to suspect abuse</li>
            </ul>
            <p style="margin-top: 20px;">I have received training on recognizing and reporting abuse and understand the reporting procedures.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'disclosure',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Confidentiality Agreement',
        description: 'Agreement to maintain confidentiality of client and organizational information',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Confidentiality Agreement</h1>
            <p style="margin-top: 30px;">I understand that in the course of my employment, I may have access to confidential information including:</p>
            <ul style="line-height: 1.8;">
              <li>Client records and personal information</li>
              <li>Organizational policies and procedures</li>
              <li>Financial information</li>
              <li>Proprietary business information</li>
            </ul>
            <p style="margin-top: 20px;">I agree to maintain the confidentiality of all such information both during and after my employment. I understand that unauthorized disclosure may result in disciplinary action, including termination, and may have legal consequences.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'agreement',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Safety and Emergency Procedures',
        description: 'Acknowledgment of receipt and understanding of safety and emergency procedures',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Safety and Emergency Procedures Acknowledgment</h1>
            <p style="margin-top: 30px;">I acknowledge that I have received and reviewed the Safety and Emergency Procedures manual. I understand:</p>
            <ul style="line-height: 1.8;">
              <li>Emergency evacuation procedures</li>
              <li>Location of emergency exits and equipment</li>
              <li>First aid procedures</li>
              <li>Reporting procedures for accidents and incidents</li>
              <li>Workplace safety protocols</li>
            </ul>
            <p style="margin-top: 20px;">I agree to follow all safety procedures and report any unsafe conditions immediately.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'acknowledgment',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Technology Use Policy',
        description: 'Agreement to comply with technology and internet use policies',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Technology Use Policy Agreement</h1>
            <p style="margin-top: 30px;">I acknowledge that I have read and understand the Technology Use Policy. I agree to:</p>
            <ul style="line-height: 1.8;">
              <li>Use organizational technology resources only for work-related purposes</li>
              <li>Maintain the security of passwords and access credentials</li>
              <li>Not share confidential information via email or other electronic means without proper authorization</li>
              <li>Report any security breaches or suspicious activity</li>
              <li>Comply with all applicable laws and regulations regarding technology use</li>
            </ul>
            <p style="margin-top: 20px;">I understand that violation of this policy may result in disciplinary action, including termination.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'agreement',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Professional Boundaries Policy',
        description: 'Acknowledgment of professional boundaries and ethical guidelines',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Professional Boundaries Policy</h1>
            <p style="margin-top: 30px;">I acknowledge that I have read and understand the Professional Boundaries Policy. I understand that:</p>
            <ul style="line-height: 1.8;">
              <li>I must maintain appropriate professional boundaries with clients at all times</li>
              <li>I must not engage in dual relationships that could impair my professional judgment</li>
              <li>I must not accept gifts or favors from clients beyond de minimis value</li>
              <li>I must not engage in personal relationships with current or former clients</li>
              <li>I must report any boundary violations or concerns to my supervisor</li>
            </ul>
            <p style="margin-top: 20px;">I understand that violation of professional boundaries may result in disciplinary action and may have legal and licensing consequences.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'compliance',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Direct Deposit Authorization',
        description: 'Authorization for direct deposit of payroll',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Direct Deposit Authorization</h1>
            <p style="margin-top: 30px;">I authorize the organization to deposit my payroll directly into my bank account as specified below:</p>
            <p style="margin-top: 20px;"><strong>Bank Name:</strong> _________________________</p>
            <p><strong>Account Type:</strong> ☐ Checking  ☐ Savings</p>
            <p><strong>Account Number:</strong> _________________________</p>
            <p><strong>Routing Number:</strong> _________________________</p>
            <p style="margin-top: 20px;">I understand that I can change or cancel this authorization at any time by providing written notice to the payroll department.</p>
            <p style="margin-top: 30px;"><strong>Employee Name:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'administrative',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'W-4 Tax Withholding Form',
        description: 'Federal tax withholding form for new employees',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Employee's Withholding Certificate (W-4)</h1>
            <p style="margin-top: 30px;"><strong>Step 1: Personal Information</strong></p>
            <p><strong>First Name:</strong> _________________________ <strong>Last Name:</strong> _________________________</p>
            <p><strong>Social Security Number:</strong> _________________________</p>
            <p><strong>Address:</strong> _________________________</p>
            <p><strong>City, State, ZIP:</strong> _________________________</p>
            <p style="margin-top: 20px;"><strong>Step 2: Multiple Jobs or Spouse Works</strong></p>
            <p>☐ I have more than one job or my spouse works</p>
            <p style="margin-top: 20px;"><strong>Step 3: Claim Dependents</strong></p>
            <p><strong>Number of dependents:</strong> _________________________</p>
            <p style="margin-top: 20px;"><strong>Step 4: Other Adjustments</strong></p>
            <p><strong>Additional withholding amount:</strong> $ _________________________</p>
            <p style="margin-top: 30px;"><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 40px;"><strong>Signature:</strong> _________________________</p>
          </div>
        `,
        document_type: 'administrative',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'I-9 Employment Eligibility Verification',
        description: 'Form I-9 for verifying employment eligibility',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px;">
            <h1 style="text-align: center; color: #1D2633;">Employment Eligibility Verification (I-9)</h1>
            <p style="margin-top: 30px;"><strong>Section 1: Employee Information and Attestation</strong></p>
            <p><strong>Last Name:</strong> _________________________ <strong>First Name:</strong> _________________________</p>
            <p><strong>Middle Initial:</strong> _________________________</p>
            <p><strong>Address:</strong> _________________________</p>
            <p><strong>Date of Birth:</strong> _________________________</p>
            <p><strong>Social Security Number:</strong> _________________________</p>
            <p style="margin-top: 20px;"><strong>I attest that I am authorized to work in the United States.</strong></p>
            <p style="margin-top: 30px;"><strong>Employee Signature:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
            <p style="margin-top: 30px;"><strong>Section 2: Employer Review and Verification</strong></p>
            <p><strong>Document Title:</strong> _________________________</p>
            <p><strong>Document Number:</strong> _________________________</p>
            <p><strong>Expiration Date:</strong> _________________________</p>
            <p style="margin-top: 30px;"><strong>Employer Signature:</strong> _________________________</p>
            <p><strong>Date:</strong> _________________________</p>
          </div>
        `,
        document_type: 'compliance',
        agency_id: null,
        is_user_specific: false
      },
      {
        name: 'Training Completion Certificate',
        description: 'Certificate acknowledging completion of required training',
        template_type: 'html',
        html_content: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; border: 3px solid #C69A2B;">
            <h1 style="text-align: center; color: #1D2633; margin-bottom: 10px;">CERTIFICATE OF COMPLETION</h1>
            <p style="text-align: center; font-size: 18px; color: #3A4C6B; margin-bottom: 30px;">This certifies that</p>
            <h2 style="text-align: center; color: #1D2633; margin: 20px 0;">_________________________</h2>
            <p style="text-align: center; font-size: 16px; color: #3A4C6B; margin-top: 30px;">has successfully completed the required training program</p>
            <p style="text-align: center; font-size: 16px; color: #3A4C6B; margin-top: 10px;"><strong>Training Focus:</strong> _________________________</p>
            <p style="text-align: center; font-size: 14px; color: #64748b; margin-top: 40px;">Date of Completion: _________________________</p>
            <p style="text-align: center; font-size: 14px; color: #64748b; margin-top: 20px;">Certificate ID: _________________________</p>
            <div style="margin-top: 60px; text-align: center;">
              <p style="border-top: 2px solid #1D2633; width: 200px; margin: 0 auto; padding-top: 10px;">Authorized Signature</p>
            </div>
          </div>
        `,
        document_type: 'acknowledgment',
        agency_id: null,
        is_user_specific: false
      }
    ];

    // Insert documents
    let insertedCount = 0;
    for (const doc of exampleDocuments) {
      try {
        // Check if document with same name already exists
        const [existing] = await pool.execute(
          'SELECT id FROM document_templates WHERE name = ? AND (agency_id IS NULL OR agency_id = ?) LIMIT 1',
          [doc.name, doc.agency_id]
        );

        if (existing.length === 0) {
          await pool.execute(
            `INSERT INTO document_templates (
              name, description, version, template_type, 
              html_content, agency_id, created_by_user_id,
              document_type, is_user_specific, user_id, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              doc.name,
              doc.description,
              1, // version
              doc.template_type,
              doc.html_content,
              doc.agency_id,
              createdByUserId,
              doc.document_type,
              doc.is_user_specific,
              null, // user_id
              true // is_active
            ]
          );
          insertedCount++;
          console.log(`✅ Created: ${doc.name}`);
        } else {
          console.log(`⏭️  Skipped (already exists): ${doc.name}`);
        }
      } catch (error) {
        console.error(`❌ Error creating ${doc.name}:`, error.message);
      }
    }

    console.log(`\n✨ Seeding complete! Created ${insertedCount} new documents.`);
  } catch (error) {
    console.error('❌ Error seeding documents:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

seedDocuments();
