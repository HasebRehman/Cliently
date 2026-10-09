import { Request, Response, NextFunction } from 'express';
import { projectService } from './project.service.js';

export class ProjectController {
  async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectService.createProject(req.ctx!, req.body);
      res.status(201).json({
        success: true,
        message: 'Project created successfully.',
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  async listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await projectService.listProjects(req.ctx!, req.query as any);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectService.getProjectById(req.ctx!, req.params.id);
      res.status(200).json({
        success: true,
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectService.updateProject(req.ctx!, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Project updated successfully.',
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await projectService.deleteProject(req.ctx!, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_UPLOADED',
            message: 'No file uploaded.',
          },
        });
        return;
      }

      const host = req.get('host');
      const protocol = req.protocol;
      const fileUrl = `${protocol}://${host}/uploads/projects/${req.file.filename}`;
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || '';
      const fileType = ext === 'pdf' ? 'pdf' : 'word';

      res.status(200).json({
        success: true,
        data: {
          url: fileUrl,
          relativePath: `/uploads/projects/${req.file.filename}`,
          fileName: req.file.originalname,
          fileType,
          fileSize: req.file.size,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async addProjectFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = await projectService.addProjectFiles(req.ctx!, req.params.id, req.body.files);
      res.status(201).json({
        success: true,
        message: 'Files uploaded successfully.',
        data: files,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProjectFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await projectService.deleteProjectFile(req.ctx!, req.params.id, req.params.fileId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async addMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const milestone = await projectService.addMilestone(req.ctx!, req.params.id, req.body);
      res.status(201).json({
        success: true,
        message: 'Milestone created successfully.',
        data: milestone,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const milestone = await projectService.updateMilestone(
        req.ctx!,
        req.params.id,
        req.params.milestoneId,
        req.body
      );
      res.status(200).json({
        success: true,
        message: 'Milestone updated successfully.',
        data: milestone,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await projectService.deleteMilestone(
        req.ctx!,
        req.params.id,
        req.params.milestoneId
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async approveMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const milestone = await projectService.approveMilestone(
        req.ctx!,
        req.params.id,
        req.params.milestoneId
      );
      res.status(200).json({
        success: true,
        message: 'Milestone approved successfully.',
        data: milestone,
      });
    } catch (error) {
      next(error);
    }
  }

  async requestMilestoneRevision(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const milestone = await projectService.requestMilestoneRevision(
        req.ctx!,
        req.params.id,
        req.params.milestoneId,
        req.body
      );
      res.status(200).json({
        success: true,
        message: 'Milestone revision requested successfully.',
        data: milestone,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const projectController = new ProjectController();
