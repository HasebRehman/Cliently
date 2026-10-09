import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { chatController } from './chat.controller.js';
import {
  createDirectChatSchema,
  createGroupChatSchema,
  addParticipantsSchema,
  sendMessageSchema,
  chatRoomParamSchema,
  chatMessageParamSchema,
  chatParticipantParamSchema,
  chatMessagesQuerySchema,
} from './chat.schema.js';

const router = Router();

// Ensure uploads/chat directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'chat');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueId = crypto.randomUUID();
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max limit as requested
  },
  fileFilter: (_req, _file, cb) => {
    cb(null, true);
  },
});

// Chat routes (require auth & tenant)
router.use(requireAuth, requireOrgContext);

// Online users list
router.get('/online-users', chatController.getOnlineUsers);

// Eligible users list
router.get('/eligible-users', chatController.getEligibleUsers);

// Total unread messages count
router.get('/unread-count', chatController.getUnreadCount);

// Conversations list
router.get('/rooms', chatController.listRooms);

// Direct 1-on-1 chat
router.post(
  '/rooms/direct',
  validateRequest({ body: createDirectChatSchema }),
  chatController.getOrCreateDirectChat
);

// Group chat (Owner only check inside service)
router.post(
  '/rooms/group',
  validateRequest({ body: createGroupChatSchema }),
  chatController.createGroupChat
);

// Room details
router.get(
  '/rooms/:roomId',
  validateRequest({ params: chatRoomParamSchema }),
  chatController.getRoomById
);

// Add participants to group (Owner only)
router.post(
  '/rooms/:roomId/participants',
  validateRequest({ params: chatRoomParamSchema, body: addParticipantsSchema }),
  chatController.addParticipants
);

// Remove participant from group (Owner only)
router.delete(
  '/rooms/:roomId/participants/:userId',
  validateRequest({ params: chatParticipantParamSchema }),
  chatController.removeParticipant
);

// Room messages
router.get(
  '/rooms/:roomId/messages',
  validateRequest({ params: chatRoomParamSchema, query: chatMessagesQuerySchema }),
  chatController.getMessages
);

// Send message
router.post(
  '/rooms/:roomId/messages',
  validateRequest({ params: chatRoomParamSchema, body: sendMessageSchema }),
  chatController.sendMessage
);

// Delete message (sender or owner)
router.delete(
  '/rooms/:roomId/messages/:messageId',
  validateRequest({ params: chatMessageParamSchema }),
  chatController.deleteMessage
);

// Upload chat attachment
router.post(
  '/upload',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size exceeds the 15MB limit.', 400, 'FILE_TOO_LARGE'));
        }
        return next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
      } else if (err) {
        return next(err);
      }
      next();
    });
  },
  chatController.uploadFile
);

export default router;
