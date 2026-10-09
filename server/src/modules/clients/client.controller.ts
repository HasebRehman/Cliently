import { Request, Response, NextFunction } from 'express';
import { clientService } from './client.service.js';

export class ClientController {
  async createClient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientService.createClient(req.ctx!, req.body);
      res.status(201).json({
        success: true,
        message: 'Client created successfully.',
        data: client,
      });
    } catch (error) {
      next(error);
    }
  }

  async listClients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await clientService.listClients(req.ctx!, req.query as any);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getClientById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientService.getClientById(req.ctx!, req.params.id);
      res.status(200).json({
        success: true,
        data: client,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateClient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientService.updateClient(req.ctx!, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Client updated successfully.',
        data: client,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteClient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await clientService.deleteClient(req.ctx!, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async sendPortalInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await clientService.sendPortalInvite(req.ctx!, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const clientController = new ClientController();
