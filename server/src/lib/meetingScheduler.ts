import { prisma } from './prisma.js';
import { sendMeetingReminderEmail } from './email.js';
import { env } from '../config/env.js';

class MeetingScheduler {
  private activeTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Schedules an automated 1-hour reminder for a future scheduled meeting
   */
  scheduleMeetingReminder(meeting: {
    id: string;
    title: string;
    startTime: Date;
    projectId?: string;
  }) {
    const startTimeMs = new Date(meeting.startTime).getTime();
    const reminderTimeMs = startTimeMs - 60 * 60 * 1000; // 1 hour before
    const nowMs = Date.now();
    const delayMs = reminderTimeMs - nowMs;

    // Clear existing timer if any
    if (this.activeTimers.has(meeting.id)) {
      clearTimeout(this.activeTimers.get(meeting.id)!);
      this.activeTimers.delete(meeting.id);
    }

    // Schedule timer if reminder is in future (within 30 days)
    if (delayMs > 0 && delayMs < 30 * 24 * 60 * 60 * 1000) {
      const timer = setTimeout(async () => {
        try {
          await this.triggerMeetingReminder(meeting.id);
        } catch (err) {
          console.error(`Failed to send 1-hour reminder for meeting ${meeting.id}:`, err);
        } finally {
          this.activeTimers.delete(meeting.id);
        }
      }, delayMs);

      // In Node, allow process to exit if only this timer is pending
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.activeTimers.set(meeting.id, timer);
    }
  }

  async triggerMeetingReminder(meetingId: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        project: true,
        createdBy: true,
        attendees: {
          include: {
            user: true,
            client: true,
          },
        },
      },
    });

    if (!meeting || meeting.status === 'cancelled' || meeting.status === 'ended') {
      return;
    }

    const hostName = `${meeting.createdBy.firstName} ${meeting.createdBy.lastName}`.trim();
    const joinUrl = `${env.CLIENT_URL}/meetings?join=${meeting.id}`;

    for (const attendee of meeting.attendees) {
      const recipientName = attendee.user
        ? `${attendee.user.firstName} ${attendee.user.lastName}`.trim()
        : attendee.client?.name || 'there';

      await sendMeetingReminderEmail({
        to: attendee.email,
        recipientName,
        hostName,
        title: meeting.title,
        projectName: meeting.project?.name,
        startTime: meeting.startTime,
        joinUrl,
      });
    }
  }
}

export const meetingScheduler = new MeetingScheduler();
