import crypto from 'crypto';
import { ChatRoomType, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import { realtimeChat } from '../../lib/ws.js';
import { generateJaasToken } from '../../utils/jaasToken.js';
import { generateMeetingIcs } from '../../utils/calendarIcs.js';
import { sendMeetingScheduledEmail } from '../../lib/email.js';
import { meetingScheduler } from '../../lib/meetingScheduler.js';
import { googleCalendarService } from '../../lib/googleCalendar.js';
import { env } from '../../config/env.js';
import {
  CreateInstantMeetingBodyInput,
  ScheduleMeetingBodyInput,
  MeetingQueryInput,
} from './meeting.schema.js';

export class MeetingService {
  /**
   * 0. List meetings for organization / active tenant
   */
  async listMeetings(ctx: TenantContext, query?: MeetingQueryInput) {
    // 1. 4-Hour Safety Net: auto-end stale live meetings
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    const now = new Date();
    const fourHoursAgo = new Date(Date.now() - FOUR_HOURS_MS);

    await prisma.meeting.updateMany({
      where: {
        companyId: ctx.organizationId,
        status: 'live',
        startTime: { lt: fourHoursAgo },
      },
      data: {
        status: 'ended',
        endTime: now,
      },
    });

    // 2. Auto-expire scheduled meetings whose end time has passed without anyone starting/joining
    await prisma.meeting.updateMany({
      where: {
        companyId: ctx.organizationId,
        status: 'scheduled',
        OR: [
          { endTime: { lt: now } },
          { endTime: null, startTime: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
        ],
      },
      data: {
        status: 'expired',
      },
    });

    const where: any = {
      companyId: ctx.organizationId,
    };

    if (query?.status === 'live') {
      where.status = 'live';
    } else if (query?.status === 'ended') {
      where.status = 'ended';
    } else if (query?.status === 'scheduled') {
      where.status = 'scheduled';
    } else if (query?.status === 'expired') {
      where.status = 'expired';
    }

    if (query?.projectId) {
      where.projectId = query.projectId;
    }


    // If role is CLIENT, filter by meetings where the client is an attendee
    if (ctx.role === 'CLIENT') {
      const client = await prisma.client.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      });

      where.OR = [
        { createdById: ctx.userId },
        { attendees: { some: { OR: [{ userId: ctx.userId }, { clientId: client?.id }] } } },
      ];
    }

    const meetings = await prisma.meeting.findMany({
      where,
      orderBy: { startTime: 'desc' },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        attendees: {
          select: {
            id: true,
            role: true,
            email: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return meetings.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      provider: m.provider,
      status: m.status,
      roomName: m.roomName,
      startTime: m.startTime,
      endTime: m.endTime,
      createdById: m.createdById,
      host: {
        id: m.createdBy.id,
        name: `${m.createdBy.firstName} ${m.createdBy.lastName}`.trim(),
        email: m.createdBy.email,
        avatarUrl: m.createdBy.avatarUrl,
      },
      project: {
        id: m.project.id,
        name: m.project.name,
      },
      attendeesCount: m.attendees.length,
      attendees: m.attendees.map((a) => ({
        id: a.id,
        role: a.role,
        email: a.email,
        name: a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : a.client?.name || a.email,
      })),
    }));
  }

  /**
   * 1. Create an instant meeting for a project or general organization sync
   * - Only project team members (OWNER/MEMBER) can create it
   * - Scoped to tenant
   * - Generates unguessable roomName
   * - Creates MeetingAttendee records for team members & project client
   * - Posts a 'meeting' message in project chat room and broadcasts it
   */
  async createInstantMeeting(
    ctx: TenantContext,
    projectIdOrInput?: string | CreateInstantMeetingBodyInput,
    possibleInput?: CreateInstantMeetingBodyInput
  ) {
    if (ctx.role === 'CLIENT') {
      throw new AppError('Clients are not permitted to start instant meetings.', 403, 'FORBIDDEN');
    }

    let resolvedProjectId: string | undefined;
    let input: CreateInstantMeetingBodyInput = {};

    if (typeof projectIdOrInput === 'string') {
      resolvedProjectId = projectIdOrInput;
      input = possibleInput || {};
    } else if (projectIdOrInput) {
      input = projectIdOrInput;
      resolvedProjectId = input.projectId;
    }

    // 1. Verify or find project in active tenant
    let project: any = null;

    if (resolvedProjectId) {
      project = await prisma.project.findFirst({
        where: {
          id: resolvedProjectId,
          organizationId: ctx.organizationId,
        },
        include: {
          client: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      });

      if (!project) {
        throw new AppError('Project not found in this organization.', 404, 'PROJECT_NOT_FOUND');
      }
    } else {
      // Find the first project in the organization, or create a default "General" project
      project = await prisma.project.findFirst({
        where: {
          organizationId: ctx.organizationId,
        },
        include: {
          client: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!project) {
        // Find or create default internal client
        let defaultClient = await prisma.client.findFirst({
          where: { organizationId: ctx.organizationId },
        });

        if (!defaultClient) {
          defaultClient = await prisma.client.create({
            data: {
              organizationId: ctx.organizationId,
              name: 'General Internal',
              email: 'internal@cliently.local',
            },
          });
        }

        project = await prisma.project.create({
          data: {
            organizationId: ctx.organizationId,
            clientId: defaultClient.id,
            name: 'General Collaboration',
            description: 'Default project workspace for organization instant meetings',
          },
          include: {
            client: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        });
      }
    }


    // 2. Fetch current user
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    // 3. Fetch all team members (OWNER and MEMBER) of the organization
    const teamMemberships = await prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: [Role.OWNER, Role.MEMBER] },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const roomName = `cliently-${crypto.randomUUID()}`;
    const meetingTitle = input.title?.trim() || `${project.name} - Instant Meeting`;
    const now = new Date();

    // 4. Create Meeting & Attendees inside a transaction
    const meeting = await prisma.$transaction(async (tx) => {
      const createdMeeting = await tx.meeting.create({
        data: {
          companyId: ctx.organizationId,
          projectId: project.id,
          title: meetingTitle,
          type: 'instant',
          provider: 'jaas',
          roomName,
          status: 'live',
          startTime: now,
          createdById: ctx.userId,
        },
      });

      // Map attendees to prevent duplicate emails
      const attendeeMap = new Map<string, {
        userId?: string;
        clientId?: string;
        email: string;
        role: 'host' | 'team' | 'client';
      }>();

      // Host
      attendeeMap.set(currentUser.email.toLowerCase(), {
        userId: currentUser.id,
        email: currentUser.email,
        role: 'host',
      });

      // Team members
      for (const m of teamMemberships) {
        const lowerEmail = m.user.email.toLowerCase();
        if (!attendeeMap.has(lowerEmail)) {
          attendeeMap.set(lowerEmail, {
            userId: m.user.id,
            email: m.user.email,
            role: 'team',
          });
        }
      }

      // Project Client
      if (project.client && project.client.email) {
        const clientEmail = project.client.email.toLowerCase();
        if (!attendeeMap.has(clientEmail)) {
          attendeeMap.set(clientEmail, {
            userId: project.client.userId || undefined,
            clientId: project.client.id,
            email: project.client.email,
            role: 'client',
          });
        }
      }

      // Insert all attendees
      await tx.meetingAttendee.createMany({
        data: Array.from(attendeeMap.values()).map((a) => ({
          meetingId: createdMeeting.id,
          userId: a.userId || null,
          clientId: a.clientId || null,
          email: a.email,
          role: a.role,
        })),
      });

      // 5. Find or create Project ChatRoom
      let chatRoom = await tx.chatRoom.findFirst({
        where: {
          organizationId: ctx.organizationId,
          projectId: project.id,
        },
      });

      if (!chatRoom) {
        chatRoom = await tx.chatRoom.create({
          data: {
            organizationId: ctx.organizationId,
            projectId: project.id,
            type: ChatRoomType.GROUP,
            name: `${project.name} Chat`,
            description: `Project collaboration & discussions for ${project.name}`,
            createdById: ctx.userId,
          },
        });
      }

      // Ensure participants exist in the chat room
      const existingParticipants = await tx.chatParticipant.findMany({
        where: { roomId: chatRoom.id },
      });
      const participantUserIds = new Set(existingParticipants.map((p) => p.userId));

      const newParticipantUserIds = Array.from(attendeeMap.values())
        .map((a) => a.userId)
        .filter((uid): uid is string => Boolean(uid && !participantUserIds.has(uid)));

      if (newParticipantUserIds.length > 0) {
        await tx.chatParticipant.createMany({
          data: newParticipantUserIds.map((userId) => ({
            roomId: chatRoom.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      // 6. Post Meeting Chat Message in Project Room
      const chatMessage = await tx.chatMessage.create({
        data: {
          roomId: chatRoom.id,
          senderId: ctx.userId,
          type: 'meeting',
          meetingId: createdMeeting.id,
          content: `Instant Meeting: ${createdMeeting.title}`,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.chatRoom.update({
        where: { id: chatRoom.id },
        data: { updatedAt: now },
      });

      return {
        meeting: createdMeeting,
        chatRoom,
        chatMessage,
      };
    });

    // 7. Broadcast meeting message over WebSocket
    const formattedMessage = {
      id: meeting.chatMessage.id,
      roomId: meeting.chatRoom.id,
      senderId: meeting.chatMessage.senderId,
      senderName: `${meeting.chatMessage.sender.firstName} ${meeting.chatMessage.sender.lastName}`.trim(),
      senderAvatar: meeting.chatMessage.sender.avatarUrl,
      type: 'meeting',
      meetingId: meeting.meeting.id,
      meeting: {
        id: meeting.meeting.id,
        title: meeting.meeting.title,
        status: meeting.meeting.status,
        provider: meeting.meeting.provider,
        startTime: meeting.meeting.startTime,
        createdById: meeting.meeting.createdById,
        hostName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
      },
      content: meeting.chatMessage.content,
      isDeleted: false,
      createdAt: meeting.chatMessage.createdAt,
      isRead: false,
      readBy: [],
    };

    realtimeChat.broadcastToRoom(meeting.chatRoom.id, {
      type: 'NEW_MESSAGE',
      roomId: meeting.chatRoom.id,
      message: formattedMessage,
    });

    // Generate JaaS token for host
    const jaasData = generateJaasToken({
      roomName: meeting.meeting.roomName,
      user: {
        id: currentUser.id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
        isHost: true,
      },
    });

    return {
      meeting: {
        id: meeting.meeting.id,
        companyId: meeting.meeting.companyId,
        projectId: meeting.meeting.projectId,
        title: meeting.meeting.title,
        type: meeting.meeting.type,
        provider: meeting.meeting.provider,
        roomName: meeting.meeting.roomName,
        status: meeting.meeting.status,
        startTime: meeting.meeting.startTime,
        createdById: meeting.meeting.createdById,
        appId: jaasData.appId,
        jwt: jaasData.token,
      },
      chatRoomId: meeting.chatRoom.id,
      chatMessage: formattedMessage,
    };
  }

  /**
   * 1b. Schedule a Future Meeting (Method 1: Auto Calendar Sync via .ics & 1-Hour Reminder)
   * - Only OWNER and MEMBER can schedule meetings
   * - Saves Meeting as status: 'scheduled' with startTime & calculated endTime
   * - Gathers selected team members and clients
   * - Generates RFC 5545 .ics calendar content (with METHOD:REQUEST for auto-detection in Google Calendar)
   * - Dispatches confirmation email to all selected attendees immediately
   * - Schedules 1-hour advance reminder via meetingScheduler
   */
  async scheduleMeeting(ctx: TenantContext, input: ScheduleMeetingBodyInput) {
    if (ctx.role === 'CLIENT') {
      throw new AppError('Clients are not permitted to schedule meetings.', 403, 'FORBIDDEN');
    }

    const startTime = new Date(input.startTime);
    if (isNaN(startTime.getTime())) {
      throw new AppError('Invalid meeting start time format.', 400, 'INVALID_DATE');
    }

    const durationMinutes = input.durationMinutes || 60;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    // 1. Resolve project in active tenant
    let project: any = null;

    if (input.projectId) {
      project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: ctx.organizationId,
        },
        include: {
          client: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!project) {
        throw new AppError('Project not found in this organization.', 404, 'PROJECT_NOT_FOUND');
      }
    } else {
      project = await prisma.project.findFirst({
        where: { organizationId: ctx.organizationId },
        include: {
          client: {
            include: {
              user: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!project) {
        let defaultClient = await prisma.client.findFirst({
          where: { organizationId: ctx.organizationId },
        });

        if (!defaultClient) {
          defaultClient = await prisma.client.create({
            data: {
              organizationId: ctx.organizationId,
              name: 'General Internal',
              email: 'internal@cliently.local',
            },
          });
        }

        project = await prisma.project.create({
          data: {
            organizationId: ctx.organizationId,
            clientId: defaultClient.id,
            name: 'General Collaboration',
            description: 'Default project workspace for organization meetings',
          },
          include: {
            client: {
              include: {
                user: true,
              },
            },
          },
        });
      }
    }

    // 2. Fetch current host user
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    const hostName = `${currentUser.firstName} ${currentUser.lastName}`.trim();
    const roomName = `cliently-${crypto.randomUUID()}`;
    const meetingTitle = input.title.trim();

    // 3. Fetch Selected Team Members
    const teamFilter: any = {
      organizationId: ctx.organizationId,
      role: { in: [Role.OWNER, Role.MEMBER] },
    };

    if (input.attendeeUserIds && input.attendeeUserIds.length > 0) {
      teamFilter.userId = { in: input.attendeeUserIds };
    }

    const teamMemberships = await prisma.membership.findMany({
      where: teamFilter,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // 4. Fetch Selected Clients
    const clientFilter: any = {
      organizationId: ctx.organizationId,
    };

    if (input.attendeeClientIds && input.attendeeClientIds.length > 0) {
      clientFilter.id = { in: input.attendeeClientIds };
    } else if (project.client) {
      clientFilter.id = project.client.id;
    }

    const clients = await prisma.client.findMany({
      where: clientFilter,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Map all unique attendees
    const attendeeMap = new Map<string, {
      userId?: string;
      clientId?: string;
      email: string;
      name: string;
      role: 'host' | 'team' | 'client';
    }>();

    // Host
    attendeeMap.set(currentUser.email.toLowerCase(), {
      userId: currentUser.id,
      email: currentUser.email,
      name: hostName,
      role: 'host',
    });

    // Team Members
    for (const m of teamMemberships) {
      const lower = m.user.email.toLowerCase();
      if (!attendeeMap.has(lower)) {
        attendeeMap.set(lower, {
          userId: m.user.id,
          email: m.user.email,
          name: `${m.user.firstName} ${m.user.lastName}`.trim(),
          role: 'team',
        });
      }
    }

    // Clients
    for (const c of clients) {
      const lower = c.email.toLowerCase();
      if (!attendeeMap.has(lower)) {
        attendeeMap.set(lower, {
          userId: c.userId || undefined,
          clientId: c.id,
          email: c.email,
          name: c.name,
          role: 'client',
        });
      }
    }

    // 5. Create Meeting and Attendees in Transaction
    const meeting = await prisma.$transaction(async (tx) => {
      const createdMeeting = await tx.meeting.create({
        data: {
          companyId: ctx.organizationId,
          projectId: project.id,
          title: meetingTitle,
          type: 'scheduled',
          provider: 'jaas',
          roomName,
          status: 'scheduled',
          startTime,
          endTime,
          createdById: ctx.userId,
        },
      });

      await tx.meetingAttendee.createMany({
        data: Array.from(attendeeMap.values()).map((a) => ({
          meetingId: createdMeeting.id,
          userId: a.userId || null,
          clientId: a.clientId || null,
          email: a.email,
          role: a.role,
        })),
      });

      return createdMeeting;
    });

    const joinUrl = `${env.CLIENT_URL}/meetings?join=${meeting.id}`;

    // 6. Generate RFC 5545 .ics content and send instant confirmation emails to all attendees
    const attendeesList = Array.from(attendeeMap.values());
    for (const attendee of attendeesList) {
      const icsContent = generateMeetingIcs({
        meetingId: meeting.id,
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime || endTime,
        organizerName: hostName,
        organizerEmail: currentUser.email,
        attendeeName: attendee.name,
        attendeeEmail: attendee.email,
        meetingUrl: joinUrl,
      });

      // Send email asynchronously (non-blocking)
      sendMeetingScheduledEmail({
        to: attendee.email,
        recipientName: attendee.name,
        hostName,
        title: meeting.title,
        projectName: project.name,
        startTime: meeting.startTime,
        endTime: meeting.endTime || endTime,
        joinUrl,
        icsContent,
      }).catch((err) => {
        console.warn(`Failed to send schedule email to ${attendee.email}:`, err);
      });
    }

    // 6b. Automatically sync to Google Calendar via Google Calendar API (Organization or Host connection)
    googleCalendarService
      .createCalendarEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        meetingId: meeting.id,
        title: meeting.title,
        description: `Cliently Video Conference for ${project.name}\nJoin Link: ${joinUrl}\nHost: ${hostName}`,
        startTime: meeting.startTime,
        endTime: meeting.endTime || endTime,
        meetingUrl: joinUrl,
        attendees: attendeesList.map((a) => ({ email: a.email, name: a.name })),
      })
      .then(async (calRes) => {
        if (calRes?.googleEventId) {
          await prisma.meeting.update({
            where: { id: meeting.id },
            data: { googleEventId: calRes.googleEventId },
          }).catch(() => {});
        }
      })
      .catch((err) => console.warn('Google Calendar sync error:', err));

    // 7. Schedule 1-hour automated reminder
    meetingScheduler.scheduleMeetingReminder({
      id: meeting.id,
      title: meeting.title,
      startTime: meeting.startTime,
      projectId: meeting.projectId,
    });

    return {
      id: meeting.id,
      companyId: meeting.companyId,
      projectId: meeting.projectId,
      projectName: project.name,
      title: meeting.title,
      type: meeting.type,
      status: meeting.status,
      roomName: meeting.roomName,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      createdById: meeting.createdById,
      host: {
        id: currentUser.id,
        name: hostName,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
      },
      attendeesCount: attendeesList.length,
      attendees: attendeesList,
    };
  }


  /**
   * 2. Get single meeting details & fresh JaaS JWT
   * - Strictly verifies tenant isolation and user authorization (host, attendee, or project team)
   * - Applies 4-hour safety net (if live for >4h, updates to ended)
   * - Signs RS256 JWT for the authenticated user
   */
  async getMeetingById(ctx: TenantContext, meetingId: string) {
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        companyId: ctx.organizationId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            clientId: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        attendees: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!meeting) {
      throw new AppError('Meeting not found in this organization.', 404, 'MEETING_NOT_FOUND');
    }

    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    // Authorization verification:
    // User is authorized if:
    // 1. User is the creator/host
    // 2. User has an attendee record (by userId or matching email)
    // 3. User is an org OWNER or MEMBER in the tenant
    const isHost = meeting.createdById === ctx.userId;
    const isAttendee = meeting.attendees.some(
      (a) =>
        a.userId === ctx.userId ||
        a.email.toLowerCase() === currentUser.email.toLowerCase() ||
        (a.client && a.client.userId === ctx.userId)
    );

    if (ctx.role === 'CLIENT' && !isAttendee) {
      throw new AppError('You do not have access to this meeting.', 403, 'MEETING_ACCESS_DENIED');
    }

    if (!isHost && !isAttendee && ctx.role !== 'OWNER' && ctx.role !== 'MEMBER') {
      throw new AppError('You do not have access to this meeting.', 403, 'MEETING_ACCESS_DENIED');
    }

    let currentStatus = meeting.status;
    let currentEndTime = meeting.endTime;
    const now = Date.now();
    const startTimeMs = new Date(meeting.startTime).getTime();
    const endTimeMs = meeting.endTime
      ? new Date(meeting.endTime).getTime()
      : startTimeMs + 60 * 60 * 1000;

    // If meeting is already expired:
    if (meeting.status === 'expired') {
      throw new AppError('This meeting has expired because its scheduled time has passed.', 400, 'MEETING_EXPIRED');
    }

    // If meeting was scheduled:
    if (meeting.status === 'scheduled') {
      if (now > endTimeMs) {
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { status: 'expired' },
        });
        throw new AppError('This scheduled meeting has expired because its scheduled time has passed.', 400, 'MEETING_EXPIRED');
      }

      // If user is joining within the valid window, transition meeting to live!
      currentStatus = 'live';
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: 'live' },
      });
    }

    // 4-Hour Safety Net:
    // If a meeting stays "live" for more than 4 hours, treat it as ended
    const meetingAgeMs = now - startTimeMs;
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

    if (currentStatus === 'live' && meetingAgeMs > FOUR_HOURS_MS) {
      currentStatus = 'ended';
      currentEndTime = new Date(startTimeMs + FOUR_HOURS_MS);

      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          status: 'ended',
          endTime: currentEndTime,
        },
      });
    }

    // Generate freshly signed RS256 JaaS token
    const jaasData = generateJaasToken({
      roomName: meeting.roomName,
      user: {
        id: currentUser.id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
        isHost,
      },
    });

    return {
      id: meeting.id,
      companyId: meeting.companyId,
      projectId: meeting.projectId,
      projectName: meeting.project.name,
      title: meeting.title,
      type: meeting.type,
      provider: meeting.provider,
      status: currentStatus,
      roomName: meeting.roomName, // Returned only to authorized users
      appId: jaasData.appId,
      jwt: jaasData.token,
      startTime: meeting.startTime,
      endTime: currentEndTime,
      createdById: meeting.createdById,
      host: {
        id: meeting.createdBy.id,
        name: `${meeting.createdBy.firstName} ${meeting.createdBy.lastName}`.trim(),
        email: meeting.createdBy.email,
        avatarUrl: meeting.createdBy.avatarUrl,
      },
      attendees: meeting.attendees.map((a) => ({
        id: a.id,
        userId: a.userId,
        clientId: a.clientId,
        email: a.email,
        role: a.role,
        name: a.user
          ? `${a.user.firstName} ${a.user.lastName}`.trim()
          : a.client?.name || a.email,
      })),
    };
  }

  /**
   * 3. End meeting
   * - Only the host (or organization OWNER) can end it
   * - Sets status to "ended" and records endTime
   */
  async endMeeting(ctx: TenantContext, meetingId: string) {
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        companyId: ctx.organizationId,
      },
      include: {
        project: true,
      },
    });

    if (!meeting) {
      throw new AppError('Meeting not found in this organization.', 404, 'MEETING_NOT_FOUND');
    }

    // Host check (org OWNER can also end)
    if (meeting.createdById !== ctx.userId && ctx.role !== 'OWNER') {
      throw new AppError('Only the meeting host can end the meeting.', 403, 'ONLY_HOST_CAN_END_MEETING');
    }

    const now = new Date();
    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'ended',
        endTime: now,
      },
    });

    // Find project chat room to broadcast update if exists
    const chatRoom = await prisma.chatRoom.findFirst({
      where: {
        organizationId: ctx.organizationId,
        projectId: meeting.projectId,
      },
    });

    if (chatRoom) {
      realtimeChat.broadcastToRoom(chatRoom.id, {
        type: 'MEETING_ENDED',
        roomId: chatRoom.id,
        meetingId: updated.id,
        status: 'ended',
        endTime: updated.endTime,
      });
    }

    return {
      id: updated.id,
      status: updated.status,
      endTime: updated.endTime,
    };
  }

  /**
   * Google Calendar OAuth: generate auth URL
   */
  async getGoogleAuthUrl(ctx: TenantContext, redirectUri?: string) {
    const authUrl = googleCalendarService.getAuthUrl(ctx.userId, redirectUri);
    return { authUrl };
  }

  /**
   * Google Calendar OAuth: handle code exchange
   */
  async handleGoogleCallback(ctx: TenantContext, code: string, redirectUri?: string) {
    return googleCalendarService.handleOAuthCallback(code, ctx.userId, ctx.organizationId, redirectUri);
  }

  /**
   * Google Calendar OAuth: get status
   */
  async getGoogleCalendarStatus(ctx: TenantContext) {
    return googleCalendarService.getStatus(ctx.userId, ctx.organizationId);
  }

  /**
   * Google Calendar OAuth: disconnect
   */
  async disconnectGoogleCalendar(ctx: TenantContext) {
    return googleCalendarService.disconnect(ctx.userId, ctx.organizationId);
  }
}

export const meetingService = new MeetingService();
