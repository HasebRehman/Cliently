import { Request, Response, NextFunction } from 'express';
import { invoiceService } from './invoice.service.js';

export class InvoiceController {
  async createInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await invoiceService.createInvoice(req.ctx!, req.body);
      res.status(201).json({
        success: true,
        message: 'Invoice created successfully.',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invoiceService.listInvoices(req.ctx!, req.query as any);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await invoiceService.getInvoiceById(req.ctx!, req.params.id);
      res.status(200).json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await invoiceService.updateInvoice(req.ctx!, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Invoice updated successfully.',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invoiceService.deleteInvoice(req.ctx!, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async sendInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invoiceService.sendInvoice(req.ctx!, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async resendInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invoiceService.resendInvoice(req.ctx!, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async cancelInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invoiceService.cancelInvoice(req.ctx!, req.params.id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async duplicateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const duplicated = await invoiceService.duplicateInvoice(req.ctx!, req.params.id);
      res.status(201).json({
        success: true,
        message: 'Invoice duplicated successfully.',
        data: duplicated,
      });
    } catch (error) {
      next(error);
    }
  }

  async getInvoicePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pdfBuffer, filename } = await invoiceService.getInvoicePdf(req.ctx!, req.params.id);
      
      const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.status(200).end(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}

export const invoiceController = new InvoiceController();
