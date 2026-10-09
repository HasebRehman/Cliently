import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';
import { AppError } from '../../middlewares/errorHandler.js';

export interface ExtractedDocument {
  fileName: string;
  fileType: string;
  text: string;
}

export interface GeneratedAiTask {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedHours?: number;
  suggestedDaysFromNow?: number;
}

export class TaskAiService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    }
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.genAI) {
      if (env.GEMINI_API_KEY) {
        this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      } else {
        throw new AppError(
          'Gemini API Key is not configured. Please add GEMINI_API_KEY to your server configuration.',
          500,
          'GEMINI_CONFIG_ERROR'
        );
      }
    }
    return this.genAI;
  }

  /**
   * Extract plain text from a file on disk or buffer based on extension
   */
  async extractTextFromFile(filePath: string, originalName: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
      }

      const ext = path.extname(originalName || filePath).toLowerCase();
      const buffer = fs.readFileSync(filePath);

      if (ext === '.pdf') {
        const pdfData = await (pdfParse as any)(buffer);
        return pdfData.text || '';
      } else if (ext === '.docx' || ext === '.doc') {
        const docxResult = await mammoth.extractRawText({ buffer });
        return docxResult.value || '';
      } else if (['.txt', '.md', '.markdown', '.json', '.csv'].includes(ext)) {
        return buffer.toString('utf-8');
      } else {
        // Fallback generic text decode
        return buffer.toString('utf-8');
      }
    } catch (err: any) {
      console.error(`Error extracting text from ${originalName}:`, err);
      return `[Failed to extract text from ${originalName}: ${err.message}]`;
    }
  }

  /**
   * Generate tasks from project details and requirement document texts
   */
  async generateTasksFromRequirements(params: {
    projectName: string;
    projectDescription?: string | null;
    projectBillingType?: string;
    projectDeadline?: Date | null;
    documents: ExtractedDocument[];
    customInstructions?: string;
  }): Promise<GeneratedAiTask[]> {
    const genAI = this.getClient();

    // Prepare aggregate requirement text
    let combinedRequirements = `Project Name: ${params.projectName}\n`;
    if (params.projectDescription) {
      combinedRequirements += `Project Description: ${params.projectDescription}\n`;
    }
    if (params.projectBillingType) {
      combinedRequirements += `Billing Model: ${params.projectBillingType}\n`;
    }
    if (params.projectDeadline) {
      combinedRequirements += `Target Project Deadline: ${new Date(params.projectDeadline).toLocaleDateString()}\n`;
    }
    if (params.customInstructions) {
      combinedRequirements += `Additional Instructions: ${params.customInstructions}\n`;
    }

    combinedRequirements += `\n--- REQUIREMENT DOCUMENTS (${params.documents.length} File(s)) ---\n`;
    for (const doc of params.documents) {
      combinedRequirements += `\n[FILE: ${doc.fileName}]\n${doc.text.slice(0, 50000)}\n`;
    }

    const systemPrompt = `You are an elite Senior Technical Project Manager and Agile Lead.
Your job is to analyze the provided client project specification documents, extract all deliverables, technical components, design needs, and business requirements, and break them down into an organized, comprehensive list of actionable tasks.

Rules:
1. Each task MUST be clear, actionable, and professionally named (e.g., "Implement User Authentication with JWT & OAuth", "Design Client Dashboard Wireframes", "Setup Stripe Subscription Webhooks", "Build Milestone Approval Flow", "Database Schema & Migration Setup", "QA Testing & Cross-browser verification").
2. Descriptions should give concise technical and implementation steps based on the document.
3. Priority MUST be one of: "LOW", "MEDIUM", "HIGH", "URGENT".
4. Estimate realistic working hours (estimatedHours) between 2 and 40 for each task.
5. Provide a suggested completion order with 'suggestedDaysFromNow' (e.g., 2, 5, 10, 15 days).
6. Return a valid JSON array of tasks matching the schema below. Do NOT include markdown code blocks or surrounding text, ONLY the pure JSON array.

JSON Schema format:
[
  {
    "title": "Setup PostgreSQL Database and Multi-tenant Schemas",
    "description": "Configure PostgreSQL database connections, Prisma models, migrations, and tenant isolation indexes.",
    "priority": "HIGH",
    "estimatedHours": 8,
    "suggestedDaysFromNow": 3
  }
]`;

    const modelNames = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-2.5-pro',
      'gemini-pro-latest',
      'gemini-2.5-flash-lite',
    ];
    let lastError: any = null;

    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        });

        const result = await model.generateContent([
          { text: systemPrompt },
          { text: `Here are the project specification files and requirements:\n\n${combinedRequirements}` },
        ]);

        const responseText = result.response.text().trim();
        const cleanedText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

        const parsed = JSON.parse(cleanedText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item) => ({
            title: String(item.title || 'Untitled Task'),
            description: String(item.description || ''),
            priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(item.priority)
              ? item.priority
              : 'MEDIUM',
            estimatedHours: typeof item.estimatedHours === 'number' ? item.estimatedHours : 8,
            suggestedDaysFromNow: typeof item.suggestedDaysFromNow === 'number' ? item.suggestedDaysFromNow : 7,
          }));
        }
      } catch (err: any) {
        console.warn(`Attempt with model ${modelName} failed:`, err?.message || err);
        lastError = err;
      }
    }

    throw new AppError(
      `AI Task Generation failed: ${lastError?.message || 'Unable to generate tasks from documents'}`,
      500,
      'AI_GENERATION_FAILED'
    );
  }
}

export const taskAiService = new TaskAiService();
