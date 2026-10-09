export type MeetingType = 'instant' | 'scheduled';
export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled' | 'expired';
export type MeetingAttendeeRole = 'host' | 'team' | 'client';

export interface MeetingAttendee {
  id: string;
  meetingId: string;
  userId?: string | null;
  clientId?: string | null;
  email: string;
  role: MeetingAttendeeRole;
  name?: string;
}

export interface Meeting {
  id: string;
  companyId: string;
  projectId: string;
  projectName?: string;
  title: string;
  type: MeetingType;
  provider: string;
  roomName?: string;
  meetLink?: string | null;
  appId?: string;
  jwt?: string | null;
  startTime: string;
  endTime?: string | null;
  status: MeetingStatus;
  createdById: string;
  host?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  attendees?: MeetingAttendee[];
}

export interface MeetingSummary {
  id: string;
  title: string;
  status: MeetingStatus;
  provider: string;
  startTime: string;
  endTime?: string | null;
  createdById: string;
  hostName?: string;
}
