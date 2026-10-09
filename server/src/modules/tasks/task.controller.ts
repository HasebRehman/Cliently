import { Request, Response, NextFunction } from 'express';
import { taskService } from './task.service.js';

export class TaskController {
  async listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await taskService.listTasks(req.ctx!, req.query as any);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const task = await taskService.getTaskById(req.ctx!, req.params.id);
      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const task = await taskService.createTask(req.ctx!, req.body);
      res.status(201).json({
        success: true,
        message: 'Task created successfully',
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const task = await taskService.updateTask(req.ctx!, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await taskService.deleteTask(req.ctx!, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async generateAiTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectId, customInstructions } = req.body;
      let fileIds: string[] = [];
      if (req.body.fileIds) {
        if (Array.isArray(req.body.fileIds)) {
          fileIds = req.body.fileIds;
        } else if (typeof req.body.fileIds === 'string') {
          try {
            fileIds = JSON.parse(req.body.fileIds);
          } catch {
            fileIds = [req.body.fileIds];
          }
        }
      }

      const files = req.files as Express.Multer.File[] | undefined;

      const result = await taskService.generateAiTasks(req.ctx!, {
        projectId,
        fileIds,
        newFiles: files,
        customInstructions,
      });

      res.status(200).json({
        success: true,
        message: 'AI tasks generated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async approveAiTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await taskService.approveAiTasks(req.ctx!, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const taskController = new TaskController();
