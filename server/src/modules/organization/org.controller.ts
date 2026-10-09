import { Request, Response, NextFunction } from 'express';
import { organizationService } from './org.service.js';

export class OrganizationController {
  async listUserOrganizations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgs = await organizationService.listUserOrganizations(req.user!.userId);
      res.status(200).json({ success: true, data: orgs });
    } catch (error) {
      next(error);
    }
  }

  async getCurrentOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await organizationService.getCurrentOrganization(req.ctx!);
      res.status(200).json({ success: true, data: org });
    } catch (error) {
      next(error);
    }
  }

  async updateCurrentOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await organizationService.updateCurrentOrganization(req.ctx!, req.body);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}

export const organizationController = new OrganizationController();
