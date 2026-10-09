import { Request, Response, NextFunction } from 'express';
import { meetingService } from './meeting.service.js';

export class MeetingController {
  async listMeetings(req: Request, res: Response, next: NextFunction) {
    try {
      const meetings = await meetingService.listMeetings(req.ctx!, req.query as any);
      res.json({
        success: true,
        data: meetings,
      });
    } catch (error) {
      next(error);
    }
  }

  async createInstantMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const projectId = req.params.projectId || req.params.id || req.body.projectId;
      const result = await meetingService.createInstantMeeting(req.ctx!, projectId, req.body);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async scheduleMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await meetingService.scheduleMeeting(req.ctx!, req.body);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }



  async getMeetingById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const meeting = await meetingService.getMeetingById(req.ctx!, id);
      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      next(error);
    }
  }

  async endMeeting(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await meetingService.endMeeting(req.ctx!, id);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getGoogleAuthUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const redirectUri = (req.query.redirectUri as string) || undefined;
      const result = await meetingService.getGoogleAuthUrl(req.ctx!, redirectUri);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async handleGoogleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const { code, redirectUri } = req.body;
      const result = await meetingService.handleGoogleCallback(req.ctx!, code, redirectUri);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getGoogleCalendarStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await meetingService.getGoogleCalendarStatus(req.ctx!);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async disconnectGoogleCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await meetingService.disconnectGoogleCalendar(req.ctx!);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const meetingController = new MeetingController();
