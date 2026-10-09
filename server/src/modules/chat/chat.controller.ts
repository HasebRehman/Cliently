import { Request, Response, NextFunction } from 'express';
import { chatService } from './chat.service.js';
import { realtimeChat } from '../../lib/ws.js';
import { AppError } from '../../middlewares/errorHandler.js';

export class ChatController {
  async getOnlineUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const onlineUserIds = realtimeChat.getOnlineUserIds();
      res.status(200).json({
        success: true,
        data: { onlineUserIds },
      });
    } catch (error) {
      next(error);
    }
  }

  async getEligibleUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await chatService.getEligibleUsers(req.ctx!);
      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  }

  async listRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rooms = await chatService.listRooms(req.ctx!);
      res.status(200).json({
        success: true,
        data: rooms,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrCreateDirectChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const room = await chatService.getOrCreateDirectChat(req.ctx!, req.body);
      res.status(200).json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  }

  async createGroupChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const room = await chatService.createGroupChat(req.ctx!, req.body);
      res.status(201).json({
        success: true,
        message: 'Group chat created successfully.',
        data: room,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRoomById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const room = await chatService.getRoomById(req.ctx!, req.params.roomId);
      res.status(200).json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await chatService.getMessages(req.ctx!, req.params.roomId, req.query as any);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const message = await chatService.sendMessage(req.ctx!, req.params.roomId, req.body);
      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded.', 400, 'NO_FILE_UPLOADED');
      }

      const host = req.get('host');
      const protocol = req.protocol;
      const fileUrl = `${protocol}://${host}/uploads/chat/${req.file.filename}`;

      res.status(200).json({
        success: true,
        data: {
          url: fileUrl,
          relativePath: `/uploads/chat/${req.file.filename}`,
          name: req.file.originalname,
          type: req.file.mimetype,
          size: req.file.size,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await chatService.deleteMessage(req.ctx!, req.params.roomId, req.params.messageId);
      res.status(200).json({
        success: true,
        message: 'Message deleted successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async addParticipants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await chatService.addParticipants(req.ctx!, req.params.roomId, req.body.memberIds);
      res.status(200).json({
        success: true,
        message: 'Participants added successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async removeParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await chatService.removeParticipant(req.ctx!, req.params.roomId, req.params.userId);
      res.status(200).json({
        success: true,
        message: 'Participant removed successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await chatService.getTotalUnreadCount(req.ctx!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
