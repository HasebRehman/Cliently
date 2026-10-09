export interface MeetingIcsOptions {
  meetingId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  organizerName: string;
  organizerEmail: string;
  attendeeName?: string;
  attendeeEmail?: string;
  meetingUrl: string;
}

export function generateMeetingIcs(options: MeetingIcsOptions): string {
  const {
    meetingId,
    title,
    description,
    startTime,
    endTime,
    organizerName,
    organizerEmail,
    attendeeName,
    attendeeEmail,
    meetingUrl,
  } = options;

  const formatDate = (date: Date): string => {
    return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const now = formatDate(new Date());
  const start = formatDate(new Date(startTime));
  const end = formatDate(new Date(endTime));
  const uid = `meet-${meetingId}@cliently.app`;
  const cleanTitle = title.replace(/[\r\n]+/g, ' ').trim();
  const cleanDesc = (description || `Join Cliently Video Meeting: ${meetingUrl}`)
    .replace(/[\r\n]+/g, '\\n')
    .replace(/[,;]/g, (match) => `\\${match}`);

  const safeOrganizerName = organizerName.replace(/["\r\n]/g, "'").trim() || 'Cliently Host';
  const safeAttendeeName = (attendeeName || attendeeEmail || 'Guest').replace(/["\r\n]/g, "'").trim();
  const safeOrganizerEmail = organizerEmail.trim();
  const safeAttendeeEmail = attendeeEmail ? attendeeEmail.trim() : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Cliently SaaS//Cliently Calendar//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${cleanTitle}`,
    `DESCRIPTION:${cleanDesc}`,
    `LOCATION:${meetingUrl}`,
    `ORGANIZER;CN="${safeOrganizerName}":mailto:${safeOrganizerEmail}`,
    safeAttendeeEmail
      ? `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${safeAttendeeName}":mailto:${safeAttendeeEmail}`
      : '',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${cleanTitle} starts in 1 hour`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.filter(Boolean).join('\r\n');
}

export function generateGoogleCalendarUrl(options: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
}): string {
  const { title, description, startTime, endTime, location } = options;

  const formatDate = (date: Date): string => {
    return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const start = formatDate(startTime);
  const end = formatDate(endTime);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: description || (location ? `Join Cliently Meeting: ${location}` : ''),
    location: location || '',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}


