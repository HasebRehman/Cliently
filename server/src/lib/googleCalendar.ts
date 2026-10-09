import { google } from 'googleapis';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

export function getGoogleOAuthClient(redirectUri?: string) {
  const uri = redirectUri || `${env.CLIENT_URL}/meetings`;
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    uri
  );
}

export function getServiceAccountAuth() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return null;
  }

  // Normalize private key from env
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
}

export class GoogleCalendarService {
  /**
   * Generates Google OAuth2 URL with offline access to receive a permanent refresh token.
   */
  getAuthUrl(userId: string, redirectUri?: string): string {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google Calendar OAuth credentials are not configured in .env');
    }

    const oauth2Client = getGoogleOAuthClient(redirectUri);
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      state: userId,
    });
  }

  /**
   * Exchanges authorization code for tokens and saves to User & Organization records
   */
  async handleOAuthCallback(code: string, userId: string, organizationId?: string, redirectUri?: string) {
    const oauth2Client = getGoogleOAuthClient(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let googleEmail: string | undefined;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      googleEmail = userInfo.data.email || undefined;
    } catch {
      // Fallback if userinfo scope isn't granted
    }

    // 1. Save on user
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token || undefined,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        googleEmail: googleEmail || undefined,
      },
    });

    // 2. Save on organization (so all meetings in the workspace automatically use this connection)
    if (organizationId) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token || undefined,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          googleEmail: googleEmail || undefined,
        },
      });
    }

    console.log(`✅ Google Calendar connected successfully for user ${userId} / org ${organizationId} (Email: ${googleEmail || 'authenticated'})`);

    return { success: true, email: googleEmail };
  }

  /**
   * Disconnects Google Calendar for user & organization
   */
  async disconnect(userId: string, organizationId?: string) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
        googleEmail: null,
      },
    });

    if (organizationId) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null,
          googleEmail: null,
        },
      });
    }

    return { success: true };
  }

  /**
   * Returns current connection status for organization or user
   */
  async getStatus(userId: string, organizationId?: string) {
    let orgGoogle: { googleAccessToken: string | null; googleRefreshToken: string | null; googleEmail: string | null } | null = null;
    if (organizationId) {
      orgGoogle = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          googleAccessToken: true,
          googleRefreshToken: true,
          googleEmail: true,
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleAccessToken: true,
        googleRefreshToken: true,
        googleEmail: true,
      },
    });

    const isConnected = Boolean(
      orgGoogle?.googleRefreshToken ||
      orgGoogle?.googleAccessToken ||
      user?.googleRefreshToken ||
      user?.googleAccessToken
    );

    const email = orgGoogle?.googleEmail || user?.googleEmail || (isConnected ? 'Connected' : null);

    return {
      isConnected,
      email,
      isConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    };
  }

  /**
   * Automatically inserts an event into Google Calendar via the Google Calendar API.
   *
   * When OAuth is connected (recommended):
   * - Inserts the event onto the organizer's primary Google Calendar.
   * - Automatically includes all attendee emails (clients + team members).
   * - Google Calendar sends invitations directly to everyone and adds it to their calendars!
   */
  async createCalendarEvent(options: {
    userId: string;
    organizationId?: string;
    meetingId: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    meetingUrl: string;
    attendees: Array<{ email: string; name?: string }>;
  }): Promise<{ googleEventId?: string; htmlLink?: string } | null> {
    try {
      const { userId, organizationId, title, description, startTime, endTime, meetingUrl, attendees } = options;

      // 1. Check for Organization or User OAuth tokens (Priority #1)
      let tokens: {
        accessToken: string | null;
        refreshToken: string | null;
        tokenExpiry: Date | null;
      } | null = null;

      if (organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: {
            googleAccessToken: true,
            googleRefreshToken: true,
            googleTokenExpiry: true,
          },
        });
        if (org?.googleRefreshToken || org?.googleAccessToken) {
          tokens = {
            accessToken: org.googleAccessToken,
            refreshToken: org.googleRefreshToken,
            tokenExpiry: org.googleTokenExpiry,
          };
        }
      }

      if (!tokens) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            googleAccessToken: true,
            googleRefreshToken: true,
            googleTokenExpiry: true,
          },
        });
        if (user?.googleRefreshToken || user?.googleAccessToken) {
          tokens = {
            accessToken: user.googleAccessToken,
            refreshToken: user.googleRefreshToken,
            tokenExpiry: user.googleTokenExpiry,
          };
        }
      }

      let authClient: any = null;
      let isOAuth = false;

      if (tokens && (tokens.refreshToken || tokens.accessToken)) {
        isOAuth = true;
        const oauth2Client = getGoogleOAuthClient();
        oauth2Client.setCredentials({
          access_token: tokens.accessToken || undefined,
          refresh_token: tokens.refreshToken || undefined,
          expiry_date: tokens.tokenExpiry ? tokens.tokenExpiry.getTime() : undefined,
        });

        // Auto-refresh token listener
        oauth2Client.on('tokens', async (newTokens) => {
          const updateData = {
            googleAccessToken: newTokens.access_token || undefined,
            googleRefreshToken: newTokens.refresh_token || undefined,
            googleTokenExpiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : undefined,
          };

          if (organizationId) {
            await prisma.organization.update({
              where: { id: organizationId },
              data: updateData,
            }).catch(() => {});
          }

          await prisma.user.update({
            where: { id: userId },
            data: updateData,
          }).catch(() => {});
        });

        authClient = oauth2Client;
      } else {
        // Fallback to Service Account if configured
        const serviceAccountAuth = getServiceAccountAuth();
        if (serviceAccountAuth) {
          authClient = serviceAccountAuth;
        }
      }

      if (!authClient) {
        console.log('ℹ️ Google Calendar: No active connection found. Skipping calendar event creation.');
        return null;
      }

      const calendar = google.calendar({ version: 'v3', auth: authClient });

      const baseEventBody = {
        summary: title,
        description: description || `Join Cliently Video Meeting:\n${meetingUrl}`,
        location: meetingUrl,
        start: {
          dateTime: new Date(startTime).toISOString(),
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup' as const, minutes: 60 },
            { method: 'email' as const, minutes: 60 },
            { method: 'popup' as const, minutes: 10 },
          ],
        },
      };

      // ─────────────────────────────────────────────────────────────────────────
      // OAUTH PATH: Insert once into primary calendar with attendees
      // Google Calendar automatically creates the event and notifies all attendees
      // ─────────────────────────────────────────────────────────────────────────
      if (isOAuth) {
        const res = await calendar.events.insert({
          calendarId: 'primary',
          sendUpdates: 'all', // Dispatches invites to all attendees automatically
          requestBody: {
            ...baseEventBody,
            attendees: attendees.map((a) => ({
              email: a.email,
              displayName: a.name || a.email,
            })),
          },
        });

        console.log(`✅ [OAuth] Google Calendar event created: ${res.data.id} (HTML: ${res.data.htmlLink})`);
        return {
          googleEventId: res.data.id || undefined,
          htmlLink: res.data.htmlLink || undefined,
        };
      }

      // ─────────────────────────────────────────────────────────────────────────
      // SERVICE ACCOUNT FALLBACK PATH
      // ─────────────────────────────────────────────────────────────────────────
      const organizer = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      const calendarIds = new Set<string>();
      if (organizer?.email) calendarIds.add(organizer.email);
      for (const a of attendees) {
        if (a.email) calendarIds.add(a.email);
      }

      let firstSuccessId: string | undefined;
      let firstHtmlLink: string | undefined;
      let totalSuccess = 0;

      for (const calId of calendarIds) {
        try {
          const res = await calendar.events.insert({
            calendarId: calId,
            sendUpdates: 'none',
            requestBody: baseEventBody,
          });
          if (!firstSuccessId) {
            firstSuccessId = res.data.id || undefined;
            firstHtmlLink = res.data.htmlLink || undefined;
          }
          totalSuccess++;
        } catch {
          // Ignore shared calendar failures in fallback
        }
      }

      if (totalSuccess > 0) {
        console.log(`✅ [ServiceAccount] Event inserted in ${totalSuccess} calendars.`);
        return {
          googleEventId: firstSuccessId,
          htmlLink: firstHtmlLink,
        };
      }

      return null;
    } catch (err: any) {
      console.warn('⚠️ Google Calendar API event creation failed:', err?.message || err);
      return null;
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();
