import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import OnboardingDataService from './onboardingData.service.js';

class OnboardingPdfService {
  static async generateOnboardingDocument(userId) {
    try {
      console.log(`OnboardingPdfService: Starting PDF generation for user ${userId}`);
      
      // Gather all data
      console.log('OnboardingPdfService: Gathering onboarding data...');
      const data = await OnboardingDataService.getAllOnboardingData(userId);
      console.log('OnboardingPdfService: Data gathered successfully');
      
      // Create new PDF document
      console.log('OnboardingPdfService: Creating PDF document...');
      const pdfDoc = await PDFDocument.create();
      
      // Generate cover page
      console.log('OnboardingPdfService: Generating cover page...');
      await this.generateCoverPage(pdfDoc, data);
      
      // Generate training summary
      console.log('OnboardingPdfService: Generating training summary...');
      await this.generateTrainingSummary(pdfDoc, data);
      
      // Generate account information section
      console.log('OnboardingPdfService: Generating account info section...');
      await this.generateAccountInfoSection(pdfDoc, data);
      
      // Embed signed documents
      console.log('OnboardingPdfService: Embedding signed documents...');
      await this.embedSignedDocuments(pdfDoc, data);
      
      // Generate certificates section
      console.log('OnboardingPdfService: Generating certificates section...');
      await this.generateCertificatesSection(pdfDoc, data);
      
      // Add footer to all pages
      console.log('OnboardingPdfService: Adding footer to all pages...');
      await this.addFooterToAllPages(pdfDoc, data);
      
      // Save and return PDF bytes
      console.log('OnboardingPdfService: Saving PDF...');
      const pdfBytes = await pdfDoc.save();
      console.log(`OnboardingPdfService: PDF saved successfully, size: ${pdfBytes.length} bytes`);
      
      return pdfBytes;
    } catch (error) {
      console.error('OnboardingPdfService: Error in generateOnboardingDocument:', error);
      console.error('OnboardingPdfService: Error stack:', error.stack);
      throw error;
    }
  }

  static async generateCoverPage(pdfDoc, data) {
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();
    
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = height - 72; // Start from top with 1 inch margin
    
    // Title
    page.drawText('Onboarding Completion Document', {
      x: 72,
      y,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 50;
    
    // User Information
    page.drawText('Employee Information', {
      x: 72,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 25;
    
    const userInfo = [
      `Name: ${data.user.first_name} ${data.user.last_name}`,
      `Email: ${data.user.email}`,
      `Status: ${data.user.status === 'completed' ? 'Onboarding Completed' : data.user.status === 'terminated' ? 'Terminated' : 'Active'}`,
      `Completion Date: ${data.user.completed_at ? new Date(data.user.completed_at).toLocaleDateString() : 'N/A'}`
    ];
    
    userInfo.forEach(line => {
      page.drawText(line, {
        x: 72,
        y,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    });
    
    y -= 20;
    
    // Agency Information
    if (data.agencyInfo) {
      page.drawText('Agency Information', {
        x: 72,
        y,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= 25;
      
      const agencyInfo = [
        `Agency: ${data.agencyInfo.name}`,
        data.agencyInfo.team_name ? `Team: ${data.agencyInfo.team_name}` : null,
        data.agencyInfo.contact_info ? `Contact: ${data.agencyInfo.contact_info}` : null
      ].filter(Boolean);
      
      agencyInfo.forEach(line => {
        page.drawText(line, {
          x: 72,
          y,
          size: 12,
          font: helvetica,
          color: rgb(0, 0, 0)
        });
        y -= 20;
      });
      
      y -= 20;
    }
    
    // Training Summary Table
    if (data.trainingData.length > 0) {
      page.drawText('Training Focus Summary', {
        x: 72,
        y,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= 30;
      
      // Table headers
      const headers = ['Training Focus', 'Completion %', 'Modules', 'Time Spent'];
      const colWidths = [200, 80, 80, 100];
      let x = 72;
      
      headers.forEach((header, i) => {
        page.drawText(header, {
          x,
          y,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0)
        });
        x += colWidths[i];
      });
      
      y -= 20;
      
      // Table rows
      let currentPage = page;
      for (const track of data.trainingData) {
        if (y < 100) {
          // Add new page if needed
          currentPage = pdfDoc.addPage([612, 792]);
          y = height - 72;
        }
        
        x = 72;
        const timeFormatted = track.totalTimeSeconds 
          ? `${Math.floor(track.totalTimeSeconds / 60)}m`
          : '0m';
        
        const rowData = [
          track.trackName.substring(0, 30),
          `${track.completionPercent}%`,
          `${track.modulesCompleted}/${track.modulesTotal}`,
          timeFormatted
        ];
        
        rowData.forEach((cell, i) => {
          currentPage.drawText(cell, {
            x,
            y,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0)
          });
          x += colWidths[i];
        });
        
        y -= 18;
      }
      
      // Total time (use currentPage)
      if (y < 100) {
        currentPage = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }
      
      y -= 20;
      
      // Total time
      currentPage.drawText(`Total Training Time: ${data.totalTime.formatted}`, {
        x: 72,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
    }
  }

  static async generateTrainingSummary(pdfDoc, data) {
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = height - 72;
    
    page.drawText('Training Summary', {
      x: 72,
      y,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 40;
    
    let currentPage = page;
    
    for (const track of data.trainingData) {
      if (y < 150) {
        currentPage = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }
      
      // Training Focus header
      currentPage.drawText(track.trackName, {
        x: 72,
        y,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= 25;
      
      if (track.trackDescription) {
        currentPage.drawText(track.trackDescription, {
          x: 72,
          y,
          size: 10,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
          maxWidth: width - 144
        });
        y -= 20;
      }
      
      // Module details
      for (const module of track.modules) {
        if (y < 100) {
          currentPage = pdfDoc.addPage([612, 792]);
          y = height - 72;
        }
        
        const moduleInfo = [
          `  • ${module.title}`,
          `    Status: ${module.status}`,
          `    Time: ${module.timeSpentMinutes || 0} minutes`,
          module.quizScore !== null ? `    Quiz Score: ${module.quizScore}% (${module.quizAttemptCount} attempts)` : null,
          module.completedAt ? `    Completed: ${new Date(module.completedAt).toLocaleDateString()}` : null
        ].filter(Boolean);
        
        moduleInfo.forEach(line => {
          currentPage.drawText(line, {
            x: 72,
            y,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0)
          });
          y -= 15;
        });
        
        y -= 5;
      }
      
      y -= 20;
    }
  }

  static async generateAccountInfoSection(pdfDoc, data) {
    if (data.accountInfo.length === 0) return;
    
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = height - 72;
    let currentPage = page;
    
    currentPage.drawText('Account Information', {
      x: 72,
      y,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 40;
    
    for (const account of data.accountInfo) {
      if (y < 150) {
        currentPage = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }
      
      currentPage.drawText(account.account_name, {
        x: 72,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= 20;
      
      const accountDetails = [
        account.account_type_name ? `Type: ${account.account_type_name}` : null,
        account.username ? `Username: ${account.username}` : null,
        account.pin ? `PIN: ${account.pin}` : null,
        account.temporary_password ? `Temporary Password: ${account.temporary_password}` : null,
        account.temporary_link ? `Temporary Link: ${account.temporary_link}` : null,
        account.agency_name ? `Agency: ${account.agency_name}` : null
      ].filter(Boolean);
      
      accountDetails.forEach(detail => {
        currentPage.drawText(`  ${detail}`, {
          x: 72,
          y,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0)
        });
        y -= 15;
      });
      
      y -= 15;
    }
  }

  static async embedSignedDocuments(pdfDoc, data) {
    if (data.signedDocuments.length === 0) return;
    
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    for (const signedDoc of data.signedDocuments) {
      try {
        // Load the signed document PDF
        const signedPdf = await PDFDocument.load(signedDoc.pdfBytes);
        const signedPages = await pdfDoc.copyPages(signedPdf, signedPdf.getPageIndices());
        
        // Add a header page for this document
        const headerPage = pdfDoc.addPage([612, 792]);
        const { width, height } = headerPage.getSize();
        
        headerPage.drawText('Signed Document', {
          x: 72,
          y: height - 72,
          size: 18,
          font: helveticaBold,
          color: rgb(0, 0, 0)
        });
        
        headerPage.drawText(signedDoc.title, {
          x: 72,
          y: height - 100,
          size: 14,
          font: helveticaBold,
          color: rgb(0, 0, 0)
        });
        
        headerPage.drawText(`Signed: ${new Date(signedDoc.signedAt).toLocaleString()}`, {
          x: 72,
          y: height - 130,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0)
        });
        
        // Add the signed document pages
        signedPages.forEach((page) => {
          pdfDoc.addPage(page);
        });
      } catch (err) {
        console.error(`Failed to embed signed document ${signedDoc.id}:`, err);
      }
    }
  }

  static async generateCertificatesSection(pdfDoc, data) {
    if (!data.certificates || data.certificates.length === 0) return;

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    let y = height - 72;

    page.drawText('Certificates', {
      x: 72,
      y,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 40;

    for (const cert of data.certificates) {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }

      const certData = typeof cert.certificate_data === 'string' 
        ? JSON.parse(cert.certificate_data) 
        : cert.certificate_data;

      page.drawText(`${certData.referenceName}`, {
        x: 72,
        y,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= 25;

      const certInfo = [
        `Certificate Number: ${certData.certificateNumber}`,
        `Type: ${cert.certificate_type === 'training_focus' ? 'Training Focus' : 'Module'}`,
        `Issued: ${new Date(cert.issued_at).toLocaleDateString()}`
      ];

      certInfo.forEach(line => {
        page.drawText(line, {
          x: 72,
          y,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0)
        });
        y -= 18;
      });

      y -= 20;
    }
  }

  static async addFooterToAllPages(pdfDoc, data) {
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    
    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      
      // Footer text
      const footerText = `Generated: ${new Date().toLocaleString()}`;
      if (data.agencyInfo) {
        const agencyFooter = `${data.agencyInfo.name}${data.agencyInfo.team_name ? ` - ${data.agencyInfo.team_name}` : ''}`;
        page.drawText(agencyFooter, {
          x: 72,
          y: 30,
          size: 8,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5)
        });
      }
      
      page.drawText(footerText, {
        x: width - 200,
        y: 30,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5)
      });
      
      // Page number
      page.drawText(`Page ${index + 1} of ${pages.length}`, {
        x: width / 2 - 30,
        y: 30,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5)
      });
    });
  }
}

export default OnboardingPdfService;

