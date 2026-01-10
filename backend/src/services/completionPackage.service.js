import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import User from '../models/User.model.js';
import SignedDocument from '../models/SignedDocument.model.js';
import Task from '../models/Task.model.js';
import UserProgress from '../models/UserProgress.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';
import Module from '../models/Module.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import UserTrack from '../models/UserTrack.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import ModuleResponseAnswer from '../models/ModuleResponseAnswer.model.js';
import OnboardingDataService from './onboardingData.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CompletionPackageService {
  static async generateCompletionPackage(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get all completed items (excluding certificates - they should be downloadable separately)
    const [signedDocuments, trainingData] = await Promise.all([
      this.getCompletedSignedDocuments(userId),
      OnboardingDataService.getUserTrainingData(userId)
    ]);

    // Get detailed completion summary with quiz responses and response answers
    const completionSummary = await this.getCompletionSummary(userId, trainingData);

    // Create temporary directory for package
    const tempDir = path.join(__dirname, '../../uploads/temp', `completion-${userId}-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Copy signed documents
      const signedDocsDir = path.join(tempDir, 'signed-documents');
      await fs.mkdir(signedDocsDir, { recursive: true });
      
      const StorageService = (await import('./storage.service.js')).default;
      
      for (const doc of signedDocuments) {
        if (doc.pdfPath) {
          try {
            // Parse path to get components
            const pathInfo = StorageService.parseSignedDocumentPath(doc.pdfPath);
            
            let fileBuffer;
            if (pathInfo && pathInfo.format === 'new') {
              // New format: use storage service
              fileBuffer = await StorageService.readSignedDocument(
                pathInfo.userId,
                pathInfo.documentId,
                pathInfo.filename
              );
            } else {
              // Old format: fallback to direct file read
              const sourcePath = path.join(__dirname, '../../uploads', doc.pdfPath);
              fileBuffer = await fs.readFile(sourcePath);
            }
            
            const destPath = path.join(signedDocsDir, doc.filename || `signed-document-${doc.id}.pdf`);
            await fs.writeFile(destPath, fileBuffer);
          } catch (err) {
            console.error(`Failed to copy signed document ${doc.id}:`, err);
          }
        }
      }

      // Generate summary PDF (certificates removed - they should be downloadable separately)
      const summaryPath = path.join(tempDir, 'completion-summary.pdf');
      await this.generateSummaryPDF(summaryPath, user, completionSummary, signedDocuments);

      // Create zip file
      const zipPath = path.join(__dirname, '../../uploads/temp', `completion-package-${userId}-${Date.now()}.zip`);
      await this.createZipFile(tempDir, zipPath);

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return zipPath;
    } catch (error) {
      // Clean up on error
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  static async getCompletedSignedDocuments(userId) {
    const documentTasks = await Task.findByUser(userId, { taskType: 'document' });
    const completedDocs = [];

    for (const task of documentTasks) {
      if (task.status === 'completed') {
        const signedDoc = await SignedDocument.findByTask(task.id);
        if (signedDoc && signedDoc.signed_pdf_path) {
          completedDocs.push({
            id: signedDoc.id,
            taskId: task.id,
            title: task.title || 'Signed Document',
            signedAt: signedDoc.signed_at,
            pdfPath: signedDoc.signed_pdf_path,
            filename: `signed-${task.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'document'}-${signedDoc.id}.pdf`
          });
        }
      }
    }

    return completedDocs;
  }

  static async getCompletionSummary(userId, trainingData) {
    const summary = {
      trainingFocuses: [],
      standaloneModules: [],
      totalTimeSeconds: 0
    };

    // Helper function to get detailed module data including quiz responses and response answers
    const getDetailedModuleData = async (moduleId, moduleTitle, completedAt) => {
      const moduleData = {
        id: moduleId,
        title: moduleTitle,
        completedAt,
        timeSpentSeconds: 0,
        quizData: null,
        responseAnswers: []
      };

      // Get time spent
      const progress = await UserProgress.findByUserAndModule(userId, moduleId);
      if (progress) {
        moduleData.timeSpentSeconds = progress.time_spent_seconds || 0;
        summary.totalTimeSeconds += moduleData.timeSpentSeconds;
      }

      // Get quiz data with detailed responses
      const latestQuiz = await QuizAttempt.getLatestAttempt(userId, moduleId);
      if (latestQuiz) {
        // Get quiz content to match questions with answers
        const contentItems = await ModuleContent.findByModuleId(moduleId);
        const quizContent = contentItems.find(item => item.content_type === 'quiz');
        
        if (quizContent) {
          const quizData = typeof quizContent.content_data === 'string' 
            ? JSON.parse(quizContent.content_data) 
            : quizContent.content_data;
          
          const questions = quizData.questions || [];
          const userAnswers = latestQuiz.answers || [];
          
          const detailedQuestions = questions.map((question, index) => {
            const userAnswer = userAnswers[index];
            let isCorrect = false;
            let correctAnswer = question.correctAnswer;
            
            if (question.type === 'multiple_choice') {
              const correctIndex = typeof question.correctAnswer === 'number' ? question.correctAnswer : 0;
              const userIndex = question.options?.findIndex(opt => opt === userAnswer) ?? -1;
              isCorrect = userIndex === correctIndex;
              correctAnswer = question.options?.[correctIndex] || '';
            } else if (question.type === 'true_false') {
              const correct = question.correctAnswer === 'true' || question.correctAnswer === true;
              const user = userAnswer === 'true' || userAnswer === true;
              isCorrect = correct === user;
              correctAnswer = correct ? 'True' : 'False';
            } else if (question.type === 'text') {
              const correct = (question.correctAnswer || '').toLowerCase().trim();
              const user = (userAnswer || '').toLowerCase().trim();
              isCorrect = correct && user && correct === user;
              correctAnswer = question.correctAnswer || '';
            }
            
            return {
              question: question.question || question.text || `Question ${index + 1}`,
              type: question.type,
              userAnswer: userAnswer || '',
              correctAnswer,
              isCorrect,
              options: question.options || []
            };
          });
          
          moduleData.quizData = {
            score: latestQuiz.score || 0,
            totalQuestions: questions.length,
            correctCount: detailedQuestions.filter(q => q.isCorrect).length,
            questions: detailedQuestions,
            completedAt: latestQuiz.completed_at
          };
        }
      }

      // Get response page answers
      const responseAnswers = await ModuleResponseAnswer.findByUserAndModule(userId, moduleId);
      for (const response of responseAnswers) {
        const contentData = typeof response.content_data === 'string'
          ? JSON.parse(response.content_data)
          : response.content_data;
        
        moduleData.responseAnswers.push({
          prompt: contentData?.prompt || 'Response Question',
          responseText: response.response_text,
          orderIndex: response.order_index || 0
        });
      }

      return moduleData;
    };

    // Process training focuses
    for (const track of trainingData) {
      if (track.status === 'complete' || track.completionPercent === 100) {
        const modules = [];
        for (const module of track.modules || []) {
          if (module.status === 'completed') {
            const detailedModule = await getDetailedModuleData(
              module.id,
              module.title,
              module.completedAt
            );
            modules.push(detailedModule);
          }
        }
        
        if (modules.length > 0) {
          summary.trainingFocuses.push({
            id: track.trackId,
            name: track.trackName,
            agencyName: track.agencyName,
            completedAt: track.modules?.[0]?.completedAt || new Date(),
            modules
          });
        }
      }
    }

    // Get standalone modules (individually assigned, not in a training focus)
    for (const track of trainingData) {
      if (track.isStandalone) {
        for (const module of track.modules || []) {
          if (module.status === 'completed') {
            const detailedModule = await getDetailedModuleData(
              module.id,
              module.title,
              module.completedAt
            );
            summary.standaloneModules.push(detailedModule);
          }
        }
      }
    }
    
    // Also check for any completed modules in tasks that might not be in trainingData
    const trainingTasks = await Task.findByUser(userId, { taskType: 'training' });
    const moduleIdsInTrainingData = new Set();
    trainingData.forEach(track => {
      if (track.modules) {
        track.modules.forEach(module => {
          moduleIdsInTrainingData.add(module.id);
        });
      }
    });
    
    for (const task of trainingTasks) {
      if (task.reference_id && !moduleIdsInTrainingData.has(task.reference_id)) {
        const progress = await UserProgress.findByUserAndModule(userId, task.reference_id);
        if (progress && progress.status === 'completed') {
          const module = await Module.findById(task.reference_id);
          if (module) {
            const detailedModule = await getDetailedModuleData(
              module.id,
              task.title || module.title,
              progress.completed_at
            );
            summary.standaloneModules.push(detailedModule);
          }
        }
      }
    }

    return summary;
  }

  static async generateSummaryPDF(outputPath, user, completionSummary, signedDocuments) {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 72;
    const margin = 72;
    const lineHeight = 20;
    const sectionSpacing = 30;

    // Title
    page.drawText('Completion Summary', {
      x: margin,
      y,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 40;

    // User info
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
    page.drawText(`User: ${userName}`, {
      x: margin,
      y,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0)
    });
    y -= lineHeight;

    page.drawText(`Email: ${user.email}`, {
      x: margin,
      y,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0)
    });
    y -= lineHeight;

    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5)
    });
    y -= sectionSpacing;

    // Total Time Spent
    const totalTimeSeconds = completionSummary.totalTimeSeconds || 0;
    const totalTimeMinutes = Math.round(totalTimeSeconds / 60);
    const totalTimeHours = Math.floor(totalTimeMinutes / 60);
    const totalTimeMinutesRemainder = totalTimeMinutes % 60;
    const totalTimeFormatted = totalTimeHours > 0 
      ? `${totalTimeHours}h ${totalTimeMinutesRemainder}m`
      : `${totalTimeMinutes}m`;

    if (y < 100) {
      page = pdfDoc.addPage([612, 792]);
      y = height - 72;
    }

    page.drawText('Total Time Spent', {
      x: margin,
      y,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= lineHeight * 1.5;

    page.drawText(`Total Training Time: ${totalTimeFormatted} (${totalTimeMinutes} minutes)`, {
      x: margin + 20,
      y,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0)
    });
    y -= sectionSpacing;

    // Training Focuses
    if (completionSummary.trainingFocuses.length > 0) {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }

      page.drawText('Training Focuses Completed', {
        x: margin,
        y,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight * 1.5;

      for (const focus of completionSummary.trainingFocuses) {
        if (y < 150) {
          page = pdfDoc.addPage([612, 792]);
          y = height - 72;
        }

        page.drawText(`${focus.name} (${focus.agencyName})`, {
          x: margin + 20,
          y,
          size: 14,
          font: helveticaBold,
          color: rgb(0, 0, 0)
        });
        y -= lineHeight;

        for (const module of focus.modules) {
          if (y < 150) {
            page = pdfDoc.addPage([612, 792]);
            y = height - 72;
          }

          // Module title and basic info
          const moduleTimeMinutes = Math.round((module.timeSpentSeconds || 0) / 60);
          let moduleText = `  • ${module.title}`;
          moduleText += ` - Time Spent: ${moduleTimeMinutes}m`;
          moduleText += ` - Completed: ${new Date(module.completedAt).toLocaleDateString()}`;

          page.drawText(moduleText, {
            x: margin + 40,
            y,
            size: 11,
            font: helveticaBold,
            color: rgb(0, 0, 0),
            maxWidth: width - margin * 2 - 40
          });
          y -= lineHeight * 1.2;

          // Quiz details
          if (module.quizData) {
            if (y < 200) {
              page = pdfDoc.addPage([612, 792]);
              y = height - 72;
            }

            page.drawText(`    Quiz Score: ${module.quizData.correctCount}/${module.quizData.totalQuestions} (${module.quizData.score}%)`, {
              x: margin + 60,
              y,
              size: 10,
              font: helvetica,
              color: rgb(0, 0, 0)
            });
            y -= lineHeight * 1.2;

            // Quiz question-by-question breakdown
            for (const question of module.quizData.questions) {
              if (y < 120) {
                page = pdfDoc.addPage([612, 792]);
                y = height - 72;
              }

              const statusIcon = question.isCorrect ? '✓' : '✗';
              const statusColor = question.isCorrect ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0);
              
              page.drawText(`    ${statusIcon} Q: ${question.question}`, {
                x: margin + 60,
                y,
                size: 9,
                font: helvetica,
                color: rgb(0, 0, 0),
                maxWidth: width - margin * 2 - 60
              });
              y -= lineHeight * 0.9;

              page.drawText(`      Your Answer: ${question.userAnswer}`, {
                x: margin + 80,
                y,
                size: 9,
                font: helvetica,
                color: rgb(0.3, 0.3, 0.3),
                maxWidth: width - margin * 2 - 80
              });
              y -= lineHeight * 0.9;

              page.drawText(`      Correct Answer: ${question.correctAnswer}`, {
                x: margin + 80,
                y,
                size: 9,
                font: helvetica,
                color: statusColor,
                maxWidth: width - margin * 2 - 80
              });
              y -= lineHeight * 1.1;
            }
          }

          // Response page answers
          if (module.responseAnswers && module.responseAnswers.length > 0) {
            if (y < 150) {
              page = pdfDoc.addPage([612, 792]);
              y = height - 72;
            }

            page.drawText(`    Response Answers:`, {
              x: margin + 60,
              y,
              size: 10,
              font: helveticaBold,
              color: rgb(0, 0, 0)
            });
            y -= lineHeight * 1.2;

            for (const response of module.responseAnswers) {
              if (y < 120) {
                page = pdfDoc.addPage([612, 792]);
                y = height - 72;
              }

              page.drawText(`    Q: ${response.prompt}`, {
                x: margin + 60,
                y,
                size: 9,
                font: helvetica,
                color: rgb(0, 0, 0),
                maxWidth: width - margin * 2 - 60
              });
              y -= lineHeight * 0.9;

              page.drawText(`    A: ${response.responseText}`, {
                x: margin + 80,
                y,
                size: 9,
                font: helvetica,
                color: rgb(0.3, 0.3, 0.3),
                maxWidth: width - margin * 2 - 80
              });
              y -= lineHeight * 1.2;
            }
          }

          y -= 10;
        }
        y -= 10;
      }
      y -= sectionSpacing;
    }

    // Standalone Modules
    if (completionSummary.standaloneModules.length > 0) {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }

      page.drawText('Standalone Modules Completed', {
        x: margin,
        y,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight * 1.5;

      for (const module of completionSummary.standaloneModules) {
        if (y < 150) {
          page = pdfDoc.addPage([612, 792]);
          y = height - 72;
        }

        // Module title and basic info
        const moduleTimeMinutes = Math.round((module.timeSpentSeconds || 0) / 60);
        let moduleText = `• ${module.title}`;
        moduleText += ` - Time Spent: ${moduleTimeMinutes}m`;
        moduleText += ` - Completed: ${new Date(module.completedAt).toLocaleDateString()}`;

        page.drawText(moduleText, {
          x: margin + 20,
          y,
          size: 11,
          font: helveticaBold,
          color: rgb(0, 0, 0),
          maxWidth: width - margin * 2 - 20
        });
        y -= lineHeight * 1.2;

        // Quiz details
        if (module.quizData) {
          if (y < 200) {
            page = pdfDoc.addPage([612, 792]);
            y = height - 72;
          }

          page.drawText(`  Quiz Score: ${module.quizData.correctCount}/${module.quizData.totalQuestions} (${module.quizData.score}%)`, {
            x: margin + 40,
            y,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0)
          });
          y -= lineHeight * 1.2;

          // Quiz question-by-question breakdown
          for (const question of module.quizData.questions) {
            if (y < 120) {
              page = pdfDoc.addPage([612, 792]);
              y = height - 72;
            }

            const statusIcon = question.isCorrect ? '✓' : '✗';
            const statusColor = question.isCorrect ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0);
            
            page.drawText(`  ${statusIcon} Q: ${question.question}`, {
              x: margin + 40,
              y,
              size: 9,
              font: helvetica,
              color: rgb(0, 0, 0),
              maxWidth: width - margin * 2 - 40
            });
            y -= lineHeight * 0.9;

            page.drawText(`    Your Answer: ${question.userAnswer}`, {
              x: margin + 60,
              y,
              size: 9,
              font: helvetica,
              color: rgb(0.3, 0.3, 0.3),
              maxWidth: width - margin * 2 - 60
            });
            y -= lineHeight * 0.9;

            page.drawText(`    Correct Answer: ${question.correctAnswer}`, {
              x: margin + 60,
              y,
              size: 9,
              font: helvetica,
              color: statusColor,
              maxWidth: width - margin * 2 - 60
            });
            y -= lineHeight * 1.1;
          }
        }

        // Response page answers
        if (module.responseAnswers && module.responseAnswers.length > 0) {
          if (y < 150) {
            page = pdfDoc.addPage([612, 792]);
            y = height - 72;
          }

          page.drawText(`  Response Answers:`, {
            x: margin + 40,
            y,
            size: 10,
            font: helveticaBold,
            color: rgb(0, 0, 0)
          });
          y -= lineHeight * 1.2;

          for (const response of module.responseAnswers) {
            if (y < 120) {
              page = pdfDoc.addPage([612, 792]);
              y = height - 72;
            }

            page.drawText(`  Q: ${response.prompt}`, {
              x: margin + 40,
              y,
              size: 9,
              font: helvetica,
              color: rgb(0, 0, 0),
              maxWidth: width - margin * 2 - 40
            });
            y -= lineHeight * 0.9;

            page.drawText(`  A: ${response.responseText}`, {
              x: margin + 60,
              y,
              size: 9,
              font: helvetica,
              color: rgb(0.3, 0.3, 0.3),
              maxWidth: width - margin * 2 - 60
            });
            y -= lineHeight * 1.2;
          }
        }

        y -= 10;
      }
      y -= sectionSpacing;
    }

    // Signed Documents Summary
    if (signedDocuments.length > 0) {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }

      page.drawText('Signed Documents Summary', {
        x: margin,
        y,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight * 1.5;

      page.drawText(`Total Documents Signed: ${signedDocuments.length}`, {
        x: margin + 20,
        y,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight * 1.5;

      for (const doc of signedDocuments) {
        if (y < 100) {
          page = pdfDoc.addPage([612, 792]);
          y = height - 72;
        }

        page.drawText(`• ${doc.title}`, {
          x: margin + 40,
          y,
          size: 11,
          font: helveticaBold,
          color: rgb(0, 0, 0),
          maxWidth: width - margin * 2 - 40
        });
        y -= lineHeight * 0.9;

        page.drawText(`  Signed: ${new Date(doc.signedAt).toLocaleString()}`, {
          x: margin + 60,
          y,
          size: 10,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
          maxWidth: width - margin * 2 - 60
        });
        y -= lineHeight * 1.2;
      }
      y -= sectionSpacing;
    }

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);
  }

  static async createZipFile(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(outputPath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }
}

export default CompletionPackageService;

