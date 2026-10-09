import { Request, Response, NextFunction } from 'express';
import { inviteService } from './invite.service.js';

export class InviteController {
  async createInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invite = await inviteService.createInvite(req.ctx!, req.body);
      res.status(201).json({ success: true, data: invite });
    } catch (error) {
      next(error);
    }
  }

  async listPendingInvites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invites = await inviteService.listPendingInvites(req.ctx!);
      res.status(200).json({ success: true, data: invites });
    } catch (error) {
      next(error);
    }
  }

  async revokeInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await inviteService.revokeInvite(req.ctx!, req.params.inviteId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getInviteDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.query.token as string;
      const details = await inviteService.getInviteDetails(token);
      res.status(200).json({ success: true, data: details });
    } catch (error) {
      next(error);
    }
  }

  async acceptInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await inviteService.acceptInvite(req.body, req.user?.userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const inviteController = new InviteController();
