import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { escapeHtml } from '../utils/sanitize.js';

const isGmail = env.SMTP_HOST === 'smtp.gmail.com' || (env.SMTP_USER && env.SMTP_USER.includes('@gmail.com'));

const transporter = nodemailer.createTransport(
  isGmail
    ? {
        service: 'gmail',
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      }
    : {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth:
          env.SMTP_USER && env.SMTP_PASS
            ? {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS,
              }
            : undefined,
      }
);

export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments,
  icalEvent,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  icalEvent?: {
    filename?: string;
    method?: string;
    content: string | Buffer;
  };
}): Promise<void> {
  if (env.NODE_ENV === 'test') {
    return;
  }

  try {
    await transporter.sendMail({
      from: `"${env.APP_NAME}" <${env.EMAIL_FROM}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]*>?/gm, ''),
      html,
      attachments,
      icalEvent,
    });
  } catch (error) {
    console.warn(`⚠️ Failed to send email to ${to}:`, error instanceof Error ? error.message : error);
  }
}


export async function sendVerificationEmail(email: string, token: string, firstName: string): Promise<void> {
  const safeName = escapeHtml(firstName);
  const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;

  if (env.NODE_ENV !== 'production') {
    console.log(`\n📧 [DEV EMAIL] Email verification for ${email}:`);
    console.log(`🔗 Verify Link: ${verifyUrl}\n`);
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">Welcome to ${escapeHtml(env.APP_NAME)}, ${safeName}!</h2>
      <p>Thank you for signing up. Please verify your email address by clicking the link below:</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Verify Email Address
        </a>
      </p>
      <p style="font-size: 12px; color: #64748b;">Or copy and paste this link into your browser:<br/><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="font-size: 12px; color: #94a3b8;">This link will expire in 24 hours. If you didn't create an account, please ignore this email.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: `Verify your ${env.APP_NAME} account`, html });
}

export async function sendExistingAccountNoticeEmail(email: string): Promise<void> {
  const loginUrl = `${env.CLIENT_URL}/login`;
  const resetUrl = `${env.CLIENT_URL}/forgot-password`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">Registration Attempt Notice</h2>
      <p>Someone recently attempted to create a new ${escapeHtml(env.APP_NAME)} account using your email address (<strong>${escapeHtml(email)}</strong>).</p>
      <p>If this was you and you already have an account, you can <a href="${loginUrl}">log in here</a> or <a href="${resetUrl}">reset your password</a>.</p>
      <p style="font-size: 12px; color: #94a3b8;">If you did not attempt this registration, you can safely disregard this email. Your account remains secure.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: `Account registration notice - ${env.APP_NAME}`, html });
}

export async function sendPasswordResetEmail(email: string, token: string, firstName: string): Promise<void> {
  const safeName = escapeHtml(firstName || 'there');
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;

  if (env.NODE_ENV !== 'production') {
    console.log(`\n📧 [DEV EMAIL] Password reset for ${email}:`);
    console.log(`🔗 Reset Link: ${resetUrl}\n`);
  }
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">Reset Your Password</h2>
      <p>Hello ${safeName},</p>
      <p>We received a request to reset the password for your ${escapeHtml(env.APP_NAME)} account. Click the button below to choose a new password:</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 12px; color: #64748b;">Or copy and paste this link into your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
      <p style="font-size: 12px; color: #94a3b8;">This single-use link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: `Password Reset Request - ${env.APP_NAME}`, html });
}

export async function sendInviteEmail(
  email: string,
  token: string,
  orgName: string,
  inviterName: string,
  role: string
): Promise<void> {
  const safeOrgName = escapeHtml(orgName);
  const safeInviterName = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  const inviteUrl = `${env.CLIENT_URL}/accept-invite?token=${encodeURIComponent(token)}`;

  if (env.NODE_ENV !== 'production') {
    console.log(`\n📧 [DEV EMAIL] Invitation generated for ${email}:`);
    console.log(`🔗 Invite Link: ${inviteUrl}\n`);
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">You've been invited to join ${safeOrgName}</h2>
      <p>${safeInviterName} has invited you to join <strong>${safeOrgName}</strong> as a <strong>${safeRole}</strong> on ${escapeHtml(env.APP_NAME)}.</p>
      <p style="margin: 24px 0;">
        <a href="${inviteUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Accept Invitation
        </a>
      </p>
      <p style="font-size: 12px; color: #64748b;">Or copy and paste this link into your browser:<br/><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p style="font-size: 12px; color: #94a3b8;">This invitation will expire in 7 days.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: `Invitation to join ${orgName} on ${env.APP_NAME}`, html });
}

export async function sendInvoiceEmail({
  to,
  clientName,
  orgName,
  invoiceNumber,
  total,
  currency,
  dueDate,
  pdfBuffer,
}: {
  to: string;
  clientName: string;
  orgName: string;
  invoiceNumber: string;
  total: number | string;
  currency: string;
  dueDate: Date | string;
  pdfBuffer: Buffer;
}): Promise<void> {
  const safeClientName = escapeHtml(clientName || 'Valued Client');
  const safeOrgName = escapeHtml(orgName);
  const safeInvoiceNumber = escapeHtml(invoiceNumber);
  const formattedDueDate = new Date(dueDate).toISOString().split('T')[0];
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">Invoice ${safeInvoiceNumber} from ${safeOrgName}</h2>
      <p>Hello ${safeClientName},</p>
      <p>Please find attached invoice <strong>${safeInvoiceNumber}</strong> from <strong>${safeOrgName}</strong>.</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${escapeHtml(currency)} ${Number(total).toFixed(2)}</p>
        <p style="margin: 4px 0;"><strong>Due Date:</strong> ${formattedDueDate}</p>
      </div>
      <p>A PDF copy of the invoice is attached to this email.</p>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Invoice ${invoiceNumber} from ${orgName}`,
    html,
    attachments: [
      {
        filename: `Invoice-${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

export async function sendMeetingScheduledEmail({
  to,
  recipientName,
  hostName,
  title,
  projectName,
  startTime,
  endTime,
  joinUrl,
  icsContent,
}: {
  to: string;
  recipientName: string;
  hostName: string;
  title: string;
  projectName?: string;
  startTime: Date;
  endTime: Date;
  joinUrl: string;
  icsContent: string;
}): Promise<void> {
  const safeRecipient = escapeHtml(recipientName || 'there');
  const safeHost = escapeHtml(hostName || 'The Team');
  const safeTitle = escapeHtml(title || 'Scheduled Meeting');
  const safeProject = projectName ? escapeHtml(projectName) : null;
  const formattedDate = new Date(startTime).toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const googleCalStart = new Date(startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const googleCalEnd = new Date(endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const googleCalParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Cliently Meeting',
    dates: `${googleCalStart}/${googleCalEnd}`,
    details: `Join Video Meeting: ${joinUrl}${projectName ? `\nProject: ${projectName}` : ''}\nHost: ${hostName}`,
    location: joinUrl,
  });
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${googleCalParams.toString()}`;

  if (env.NODE_ENV !== 'production') {
    console.log(`\n📅 [DEV EMAIL] Meeting invitation for ${to}:`);
    console.log(`   Title: ${title} | When: ${formattedDate}`);
    console.log(`   Join Link: ${joinUrl}\n`);
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Meeting Invitation</h1>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 15px; margin-top: 0;">Hello <strong>${safeRecipient}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              <strong>${safeHost}</strong> has scheduled a video meeting with you:
            </p>

            <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0;">
              <h2 style="font-size: 17px; margin: 0 0 10px 0; color: #1e293b;">${safeTitle}</h2>
              ${safeProject ? `<p style="margin: 4px 0; font-size: 13px; color: #64748b;">📁 <strong>Project:</strong> ${safeProject}</p>` : ''}
              <p style="margin: 4px 0; font-size: 13px; color: #64748b;">📅 <strong>When:</strong> ${formattedDate}</p>
              <p style="margin: 4px 0; font-size: 13px; color: #64748b;">👤 <strong>Host:</strong> ${safeHost}</p>
            </div>

            <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #1e40af; font-weight: 600;">
                📅 Calendar Invitation Synced:
              </p>
              <p style="margin: 0; font-size: 12px; color: #3b82f6; line-height: 1.5;">
                This meeting has been automatically created and synced to your Google Calendar.
              </p>
              <p style="margin: 10px 0 0 0;">
                <a href="https://calendar.google.com/calendar/r" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: 600; display: inline-block;">
                  📅 Open Google Calendar
                </a>
              </p>
            </div>

            <div style="text-align: center; margin: 28px 0 20px 0;">
              <a href="${joinUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
                Join Video Meeting
              </a>
            </div>
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">
              Or access directly: <a href="${joinUrl}" style="color: #4f46e5;">${joinUrl}</a>
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            Sent by ${escapeHtml(env.APP_NAME)} • Secure Video Conferencing
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `📅 Meeting Invitation: ${title} - ${formattedDate}`,
    html,
    icalEvent: {
      filename: 'invite.ics',
      method: 'REQUEST',
      content: icsContent,
    },
  });
}

export async function sendMeetingReminderEmail({
  to,
  recipientName,
  hostName,
  title,
  projectName,
  startTime,
  joinUrl,
}: {
  to: string;
  recipientName: string;
  hostName: string;
  title: string;
  projectName?: string;
  startTime: Date;
  joinUrl: string;
}): Promise<void> {
  const safeRecipient = escapeHtml(recipientName || 'there');
  const safeHost = escapeHtml(hostName || 'The Team');
  const safeTitle = escapeHtml(title || 'Scheduled Meeting');
  const safeProject = projectName ? escapeHtml(projectName) : null;
  const formattedTime = new Date(startTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (env.NODE_ENV !== 'production') {
    console.log(`\n⏰ [DEV EMAIL] 1-Hour Meeting Reminder for ${to}:`);
    console.log(`   Title: ${title} | Starts at: ${formattedTime}`);
    console.log(`   Join Link: ${joinUrl}\n`);
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #059669; padding: 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 700;">⏰ Meeting Starts in 1 Hour</h1>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 15px; margin-top: 0;">Hello <strong>${safeRecipient}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              This is a quick reminder that your upcoming video meeting with <strong>${safeHost}</strong> is starting in <strong>1 hour</strong> at <strong>${formattedTime}</strong>.
            </p>

            <div style="background-color: #f1f5f9; border-left: 4px solid #059669; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0;">
              <h2 style="font-size: 16px; margin: 0 0 8px 0; color: #1e293b;">${safeTitle}</h2>
              ${safeProject ? `<p style="margin: 4px 0; font-size: 13px; color: #64748b;">📁 <strong>Project:</strong> ${safeProject}</p>` : ''}
              <p style="margin: 4px 0; font-size: 13px; color: #64748b;">🕒 <strong>Starts at:</strong> ${formattedTime}</p>
            </div>

            <div style="text-align: center; margin: 28px 0 16px 0;">
              <a href="${joinUrl}" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
                Join Meeting Room
              </a>
            </div>
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">
              Direct URL: <a href="${joinUrl}" style="color: #059669;">${joinUrl}</a>
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 14px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            ${escapeHtml(env.APP_NAME)} • Automated Reminder
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `⏰ Reminder: ${title} starts in 1 hour (${formattedTime})`,
    html,
  });
}

export async function sendMilestoneCompletedEmail({
  to,
  clientName,
  projectName,
  milestoneTitle,
  projectId,
}: {
  to: string;
  clientName: string;
  projectName: string;
  milestoneTitle: string;
  projectId: string;
}): Promise<void> {
  const safeClient = escapeHtml(clientName || 'Valued Client');
  const safeProject = escapeHtml(projectName);
  const safeMilestone = escapeHtml(milestoneTitle);
  const projectUrl = `${env.CLIENT_URL}/projects/${projectId}`;

  if (env.NODE_ENV !== 'production') {
    console.log(`\n🚩 [DEV EMAIL] Milestone Completed notification for ${to}:`);
    console.log(`   Project: ${projectName} | Milestone: ${milestoneTitle}\n`);
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Milestone Deliverable Ready for Review</h1>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 15px; margin-top: 0;">Hello <strong>${safeClient}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Great news! A milestone deliverable for project <strong>${safeProject}</strong> has been marked as <strong>Completed</strong> and is ready for your review:
            </p>

            <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0;">
              <h2 style="font-size: 16px; margin: 0 0 6px 0; color: #1e293b;">🚩 ${safeMilestone}</h2>
              <p style="margin: 2px 0; font-size: 13px; color: #64748b;">📁 <strong>Project:</strong> ${safeProject}</p>
              <p style="margin: 2px 0; font-size: 13px; color: #10b981; font-weight: 600;">Status: Completed (Awaiting Client Review)</p>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Please review the completed phase in your portal. If everything meets your requirements, you can <strong>Approve</strong> it, or you can <strong>Request a Revision</strong> with feedback.
            </p>

            <div style="text-align: center; margin: 28px 0 20px 0;">
              <a href="${projectUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
                Review Milestone in Portal
              </a>
            </div>
          </div>
          <div style="background-color: #f8fafc; padding: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            Sent by ${escapeHtml(env.APP_NAME)} • Milestone Delivery Tracking
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `🚩 Milestone Ready for Review: ${milestoneTitle} (${projectName})`,
    html,
  });
}

export async function sendMilestoneApprovedEmail({
  to,
  ownerName,
  clientName,
  projectName,
  milestoneTitle,
  projectId,
}: {
  to: string;
  ownerName: string;
  clientName: string;
  projectName: string;
  milestoneTitle: string;
  projectId: string;
}): Promise<void> {
  const safeOwner = escapeHtml(ownerName || 'Project Manager');
  const safeClient = escapeHtml(clientName || 'The Client');
  const safeProject = escapeHtml(projectName);
  const safeMilestone = escapeHtml(milestoneTitle);
  const projectUrl = `${env.CLIENT_URL}/projects/${projectId}`;

  if (env.NODE_ENV !== 'production') {
    console.log(`\n✅ [DEV EMAIL] Milestone Approved notification for ${to}:`);
    console.log(`   Project: ${projectName} | Milestone: ${milestoneTitle} | Approved by: ${clientName}\n`);
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #059669; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">✅ Milestone Approved!</h1>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 15px; margin-top: 0;">Hello <strong>${safeOwner}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              <strong>${safeClient}</strong> has reviewed and officially <strong>Approved</strong> the milestone deliverable:
            </p>

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0;">
              <h2 style="font-size: 16px; margin: 0 0 6px 0; color: #1e293b;">🚩 ${safeMilestone}</h2>
              <p style="margin: 2px 0; font-size: 13px; color: #64748b;">📁 <strong>Project:</strong> ${safeProject}</p>
              <p style="margin: 2px 0; font-size: 13px; color: #059669; font-weight: 700;">Status: Approved by Client</p>
            </div>

            <div style="text-align: center; margin: 28px 0 20px 0;">
              <a href="${projectUrl}" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
                View Project Details
              </a>
            </div>
          </div>
          <div style="background-color: #f8fafc; padding: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            Sent by ${escapeHtml(env.APP_NAME)} • Milestone Delivery Tracking
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `✅ Milestone Approved: ${milestoneTitle} (${projectName})`,
    html,
  });
}

export async function sendMilestoneRevisionEmail({
  to,
  ownerName,
  clientName,
  projectName,
  milestoneTitle,
  revisionNotes,
  projectId,
}: {
  to: string;
  ownerName: string;
  clientName: string;
  projectName: string;
  milestoneTitle: string;
  revisionNotes: string;
  projectId: string;
}): Promise<void> {
  const safeOwner = escapeHtml(ownerName || 'Project Manager');
  const safeClient = escapeHtml(clientName || 'The Client');
  const safeProject = escapeHtml(projectName);
  const safeMilestone = escapeHtml(milestoneTitle);
  const safeNotes = escapeHtml(revisionNotes);
  const projectUrl = `${env.CLIENT_URL}/projects/${projectId}`;

  if (env.NODE_ENV !== 'production') {
    console.log(`\n✏️ [DEV EMAIL] Milestone Revision Requested for ${to}:`);
    console.log(`   Project: ${projectName} | Milestone: ${milestoneTitle} | Notes: ${revisionNotes}\n`);
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #d97706; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">✏️ Milestone Revision Requested</h1>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 15px; margin-top: 0;">Hello <strong>${safeOwner}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              <strong>${safeClient}</strong> has requested revisions for the milestone:
            </p>

            <div style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0;">
              <h2 style="font-size: 16px; margin: 0 0 6px 0; color: #1e293b;">🚩 ${safeMilestone}</h2>
              <p style="margin: 2px 0; font-size: 13px; color: #64748b;">📁 <strong>Project:</strong> ${safeProject}</p>
              <p style="margin: 6px 0 2px 0; font-size: 13px; color: #b45309; font-weight: 700;">Client Feedback & Notes:</p>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #78350f; background: #fef3c7; padding: 10px; border-radius: 6px; white-space: pre-wrap;">${safeNotes}</p>
            </div>

            <p style="font-size: 13px; color: #64748b;">
              The milestone status has been automatically updated to <strong>Pending</strong> so your team can address the feedback and mark it as Completed again when resolved.
            </p>

            <div style="text-align: center; margin: 28px 0 20px 0;">
              <a href="${projectUrl}" style="background-color: #d97706; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
                Review Feedback & Project
              </a>
            </div>
          </div>
          <div style="background-color: #f8fafc; padding: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            Sent by ${escapeHtml(env.APP_NAME)} • Milestone Delivery Tracking
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `✏️ Revision Requested: ${milestoneTitle} (${projectName})`,
    html,
  });
}



