import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { taskController } from './task.controller.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { AppError } from '../../middlewares/errorHandler.js';
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  taskParamSchema,
  approveAiTasksSchema,
} from './task.schema.js';

const router = Router();

// Ensure uploads/projects directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'projects');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage for requirement documents
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueId = crypto.randomUUID();
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx', '.txt', '.md'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF, Word (.doc, .docx), and text files (.txt, .md) are allowed.', 400, 'INVALID_FILE_TYPE'));
    }
  },
});

// All task endpoints require authentication and tenant context
router.use(requireAuth, requireOrgContext);

// 1. List tasks (OWNER, MEMBER, CLIENT)
router.get(
  '/',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ query: taskQuerySchema }),
  taskController.listTasks
);

// 2. Create task manually (OWNER only)
router.post(
  '/',
  requireRole('OWNER'),
  validateRequest({ body: createTaskSchema }),
  taskController.createTask
);

// 3. Generate tasks with AI from project documents (OWNER only)
router.post(
  '/generate-ai',
  requireRole('OWNER'),
  (req, res, next) => {
    upload.array('files', 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size exceeds the 25MB limit.', 400, 'FILE_TOO_LARGE'));
        }
        return next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
      } else if (err) {
        return next(err);
      }
      next();
    });
  },
  taskController.generateAiTasks
);

// 4. Approve AI-generated tasks (OWNER only)
router.post(
  '/approve-ai',
  requireRole('OWNER'),
  validateRequest({ body: approveAiTasksSchema }),
  taskController.approveAiTasks
);

// 5. Get single task by ID (OWNER, MEMBER, CLIENT)
router.get(
  '/:id',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ params: taskParamSchema }),
  taskController.getTaskById
);

// 6. Update task (OWNER, MEMBER)
router.patch(
  '/:id',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ params: taskParamSchema, body: updateTaskSchema }),
  taskController.updateTask
);

// 7. Delete task (OWNER only)
router.delete(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: taskParamSchema }),
  taskController.deleteTask
);

export default router;
