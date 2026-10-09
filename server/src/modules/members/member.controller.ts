import { Request, Response, NextFunction } from 'express';
import { memberService } from './member.service.js';

export class MemberController {
  async listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const members = await memberService.listMembers(req.ctx!);
      res.status(200).json({ success: true, data: members });
    } catch (error) {
      next(error);
    }
  }

  async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await memberService.updateMemberRole(
        req.ctx!,
        req.params.memberId,
        req.body
      );
      res.status(200).json({ success: true, data: member });
    } catch (error) {
      next(error);
    }
  }

  async updateMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await memberService.updateMember(
        req.ctx!,
        req.params.memberId,
        req.body
      );
      res.status(200).json({ success: true, data: member });
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await memberService.removeMember(req.ctx!, req.params.memberId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const memberController = new MemberController();
