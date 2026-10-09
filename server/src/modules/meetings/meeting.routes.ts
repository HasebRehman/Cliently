import { Router } from 'express';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { meetingController } from './meeting.controller.js';
import {
  meetingParamSchema,
  meetingQuerySchema,
  createInstantMeetingBodySchema,
  scheduleMeetingBodySchema,
} from './meeting.schema.js';

const router = Router();

// All meeting endpoints require authentication and tenant context
router.use(requireAuth, requireOrgContext);

// 1. List all meetings for tenant
router.get(
  '/',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ query: meetingQuerySchema }),
  meetingController.listMeetings
);

// 2. Start instant meeting (OWNER, MEMBER)
router.post(
  '/instant',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ body: createInstantMeetingBodySchema }),
  meetingController.createInstantMeeting
);

// 3. Schedule future meeting (OWNER, MEMBER)
router.post(
  '/schedule',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ body: scheduleMeetingBodySchema }),
  meetingController.scheduleMeeting
);

// Google Calendar OAuth & Sync routes
router.get(
  '/google/status',
  requireRole('OWNER', 'MEMBER'),
  meetingController.getGoogleCalendarStatus
);

router.get(
  '/google/auth-url',
  requireRole('OWNER', 'MEMBER'),
  meetingController.getGoogleAuthUrl
);

router.post(
  '/google/callback',
  requireRole('OWNER', 'MEMBER'),
  meetingController.handleGoogleCallback
);

router.post(
  '/google/disconnect',
  requireRole('OWNER', 'MEMBER'),
  meetingController.disconnectGoogleCalendar
);

// 4. Get meeting details & fresh JaaS token
router.get(
  '/:id',
  validateRequest({ params: meetingParamSchema }),
  meetingController.getMeetingById
);

// 4. End meeting (Host or Owner)
router.post(
  '/:id/end',
  validateRequest({ params: meetingParamSchema }),
  meetingController.endMeeting
);

export default router;

