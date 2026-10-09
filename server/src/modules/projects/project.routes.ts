import { Router } from 'express';
import { projectController } from './project.controller.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { AppError } from '../../middlewares/errorHandler.js';
import {
  createProjectSchema,
  updateProjectSchema,
  projectQuerySchema,
  projectParamSchema,
  projectFileParamSchema,
  projectFileInputSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  milestoneParamSchema,
  milestoneRevisionSchema,
} from './project.schema.js';
import { z } from 'zod';
import { meetingController } from '../meetings/meeting.controller.js';
import {
  projectMeetingParamSchema,
  createInstantMeetingBodySchema,
} from '../meetings/meeting.schema.js';

const router = Router();

// Ensure uploads/projects directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'projects');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage for project documents
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
    const allowed = ['.pdf', '.doc', '.docx'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF and Word documents (.pdf, .doc, .docx) are allowed.', 400, 'INVALID_FILE_TYPE'));
    }
  },
});

// All project endpoints require authentication and tenant context
router.use(requireAuth, requireOrgContext);

// Upload file for project (temp or existing) (OWNER, MEMBER)
router.post(
  '/upload',
  requireRole('OWNER', 'MEMBER'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
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
  projectController.uploadFile
);

// 1. List projects (OWNER, MEMBER, CLIENT)
router.get(
  '/',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ query: projectQuerySchema }),
  projectController.listProjects
);

// 2. Create project (OWNER only)
router.post(
  '/',
  requireRole('OWNER'),
  validateRequest({ body: createProjectSchema }),
  projectController.createProject
);

// 3. Start Instant Meeting for a project (OWNER, MEMBER)
router.post(
  '/:projectId/meetings/instant',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({
    params: projectMeetingParamSchema,
    body: createInstantMeetingBodySchema,
  }),
  meetingController.createInstantMeeting
);

// Fallback alias in case params use :id instead of :projectId
router.post(
  '/:id/meetings/instant',
  (req, _res, next) => {
    if (!req.params.projectId && req.params.id) {
      req.params.projectId = req.params.id;
    }
    next();
  },
  requireRole('OWNER', 'MEMBER'),
  validateRequest({
    params: projectMeetingParamSchema,
    body: createInstantMeetingBodySchema,
  }),
  meetingController.createInstantMeeting
);

// 4. Get project details (OWNER, MEMBER, CLIENT)
router.get(
  '/:id',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ params: projectParamSchema }),
  projectController.getProjectById
);

// 5. Update project (OWNER only)
router.patch(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: projectParamSchema, body: updateProjectSchema }),
  projectController.updateProject
);

// 6. Delete project (OWNER only)
router.delete(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: projectParamSchema }),
  projectController.deleteProject
);

// 7. Add files to existing project (OWNER, MEMBER)
router.post(
  '/:id/files',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({
    params: projectParamSchema,
    body: z.object({
      files: z.array(projectFileInputSchema).min(1).max(5),
    }),
  }),
  projectController.addProjectFiles
);

// 8. Delete file from project (OWNER, MEMBER)
router.delete(
  '/:id/files/:fileId',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ params: projectFileParamSchema }),
  projectController.deleteProjectFile
);

// 9. Add milestone to project (OWNER only)
router.post(
  '/:id/milestones',
  requireRole('OWNER'),
  validateRequest({
    params: projectParamSchema,
    body: createMilestoneSchema,
  }),
  projectController.addMilestone
);

// 10. Update milestone (OWNER only)
router.patch(
  '/:id/milestones/:milestoneId',
  requireRole('OWNER'),
  validateRequest({
    params: milestoneParamSchema,
    body: updateMilestoneSchema,
  }),
  projectController.updateMilestone
);

// 11. Approve milestone (CLIENT, OWNER)
router.post(
  '/:id/milestones/:milestoneId/approve',
  requireRole('CLIENT', 'OWNER'),
  validateRequest({ params: milestoneParamSchema }),
  projectController.approveMilestone
);

// 12. Request revision on milestone (CLIENT, OWNER)
router.post(
  '/:id/milestones/:milestoneId/revision',
  requireRole('CLIENT', 'OWNER'),
  validateRequest({
    params: milestoneParamSchema,
    body: milestoneRevisionSchema,
  }),
  projectController.requestMilestoneRevision
);

// 13. Delete milestone (OWNER only)
router.delete(
  '/:id/milestones/:milestoneId',
  requireRole('OWNER'),
  validateRequest({ params: milestoneParamSchema }),
  projectController.deleteMilestone
);

export default router;
