import nodemailer from 'nodemailer';
import logger from '../utils/logger';
import { config } from '../config/config';

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) {
    return transporter;
  }

  const host = config.SMTP_HOST;
  const port = config.SMTP_PORT;
  const user = config.SMTP_USER;
  const pass = config.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      pool: true, // Use connection pooling
      host,
      port: parseInt(port || '587', 10),
      secure: config.SMTP_SECURE === 'true',
      auth: {
        user,
        pass,
      },
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,   // 10 seconds
      socketTimeout: 15000,     // 15 seconds
    });
    logger.info(`📧 Nodemailer SMTP connection pool initialized for ${host}`);
  } catch (error) {
    logger.error(`❌ Failed to initialize Nodemailer SMTP connection pool: ${(error as Error).message}`);
    transporter = null;
  }

  return transporter;
};

export interface RoleChangeMeta {
  targetName?: string;
  targetEmail?: string;
  newRole?: 'ADMIN' | 'STUDENT';
  requesterEmail?: string;
}

export const sendOTPEmail = async (
  email: string,
  otp: string,
  type: 'register' | 'login' | 'reset-password' | 'admin-role-change' = 'register',
  meta?: RoleChangeMeta
) => {
  const isLogin = type === 'login';
  const isReset = type === 'reset-password';
  const isRoleChange = type === 'admin-role-change';

  const subject = isRoleChange
    ? `🛡️ Rentora Master Security: Authorize Admin Privilege Change (${meta?.newRole === 'ADMIN' ? 'PROMOTION' : 'REVOCATION'})`
    : isReset
    ? '🔐 Rentora Password Reset Code'
    : isLogin
    ? '🔑 Rentora Login Code'
    : '🔒 Rentora Verification Code';

  const title = isRoleChange
    ? 'Master Security Authorization'
    : isReset
    ? 'Reset Your Password'
    : isLogin
    ? 'Login to Rentora'
    : 'Verify Your Account';

  const actionText = meta?.newRole === 'ADMIN'
    ? `Promote <strong>${meta.targetName || 'User'}</strong> (${meta.targetEmail || 'No email'}) to <strong>ADMINISTRATOR</strong>`
    : `Revoke administrator privileges from <strong>${meta?.targetName || 'User'}</strong> (${meta?.targetEmail || 'No email'}) back to <strong>STUDENT</strong>`;

  const description = isRoleChange
    ? `An administrator privilege change was initiated: ${actionText}. Use the 6-digit master security code below to authorize and complete this action. This code will expire in 10 minutes.`
    : isReset
    ? 'Use the 6-digit verification code below to reset your Rentora account password. This code will expire in 15 minutes.'
    : isLogin
    ? 'Use the code below to log in to your Rentora account. This code is valid for 10 minutes.'
    : 'Use the code below to complete your registration. This code will expire in 10 minutes.';

  const text = isRoleChange
    ? `Rentora Master Security Authorization Code: ${otp}. Action: ${meta?.newRole === 'ADMIN' ? 'Promote' : 'Revoke'} ${meta?.targetName} (${meta?.targetEmail}) to ${meta?.newRole}. Expires in 10 minutes.`
    : isReset
    ? `Your Rentora password reset code is: ${otp}. This code is valid for 15 minutes.`
    : isLogin
    ? `Your Rentora login verification code is: ${otp}. This code is valid for 10 minutes.`
    : `Your Rentora account verification code is: ${otp}. This code is valid for 10 minutes.`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <h2 style="color: ${isRoleChange ? '#9E1B1B' : '#4f46e5'}; text-align: center; margin-top: 0;">${title}</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Dear Rentora Master Administrator,</p>
      <div style="background-color: ${isRoleChange ? '#fff1f2' : '#f8fafc'}; border: 1px solid ${isRoleChange ? '#fecdd3' : '#e2e8f0'}; padding: 14px; border-radius: 12px; margin: 16px 0; color: #1e293b; font-size: 13px; line-height: 1.5;">
        ${description}
      </div>
      <div style="background-color: #f1f5f9; padding: 16px; border-radius: 12px; text-align: center; margin: 20px 0;">
        <span style="font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #0f172a; font-family: monospace;">${otp}</span>
      </div>
      ${isRoleChange ? '<p style="color: #e11d48; font-size: 12px; font-weight: bold; text-align: center;">⚠️ If you did NOT authorize this admin role change, do not share this code.</p>' : '<p style="font-size: 12px; color: #64748b;">If you did not make this request, please ignore this email.</p>'}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-bottom: 0;">
        Rentora Security Notification System — NIET Greater Noida
      </p>
    </div>
  `;

  // Log OTP in development mode for easier debugging/testing
  if (process.env.NODE_ENV === 'development') {
    logger.info(`🔑 [Dev Mode OTP Log] To: ${email} | Type: ${type} | OTP: ${otp}`);
  }

  // Option 1: Use Resend API if API Key is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const fromEmail = process.env.EMAIL_FROM || '"Rentora Verification" <onboarding@resend.dev>';
      logger.info(`📧 Attempting to send OTP to ${email} via Resend API...`);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject,
          text,
          html,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        logger.info(`📧 ${isLogin ? 'Login' : 'Signup'} OTP email successfully sent to ${email} via Resend. ID: ${data.id}`);
        return;
      } else {
        const errorText = await response.text();
        logger.error(`❌ Resend API returned error status ${response.status}: ${errorText}`);
      }
    } catch (resendError) {
      logger.error(`❌ Failed to send email via Resend API: ${(resendError as Error).message}`);
    }
  }

  // Option 2: Fallback to SMTP connection pool
  const smtpTransporter = getTransporter();

  if (!smtpTransporter) {
    logger.warn(`🔑 [Rentora ${isLogin ? 'Login' : 'Signup'} OTP Fallback] To: ${email} | Verification Code: ${otp} (Configure SMTP_HOST or RESEND_API_KEY to send real emails)`);
    return;
  }

  const mailOptions = {
    from: `"Rentora Verification" <${config.SMTP_USER}>`,
    to: email,
    subject,
    text,
    html,
  };

  try {
    await smtpTransporter.sendMail(mailOptions);
    logger.info(`📧 ${isLogin ? 'Login' : 'Signup'} OTP email successfully sent to ${email} via SMTP`);
  } catch (error) {
    logger.error(`❌ Failed to send ${isLogin ? 'login' : 'verification'} email via SMTP: ${(error as Error).message}`);
    logger.warn(`🔑 [Rentora ${isLogin ? 'Login' : 'Signup'} OTP Fallback (SMTP Error)] To: ${email} | Verification Code: ${otp}`);
  }
};

export interface RentalEmailData {
  recipientEmail: string;
  recipientName: string;
  type: 'RENTAL_REQUEST' | 'REQUEST_ACCEPTED' | 'REQUEST_REJECTED' | 'RENTAL_CANCELLED' | 'RENTAL_REMINDER' | 'RENTAL_COMPLETED' | string;
  itemTitle: string;
  senderName: string;
  startDate?: string | Date;
  endDate?: string | Date;
  message?: string;
  reason?: string;
  actionUrl?: string;
}

/**
 * Sends a rich email notification to a user for rental request events (offline notification).
 */
export const sendRentalNotificationEmail = async (data: RentalEmailData) => {
  const {
    recipientEmail,
    recipientName,
    type,
    itemTitle,
    senderName,
    startDate,
    endDate,
    message,
    reason,
    actionUrl = `${config.CLIENT_URL || 'http://localhost:5173'}/my-rentals`,
  } = data;

  if (!recipientEmail) {
    logger.warn('[Mail Service] Cannot send rental email without recipient email address');
    return;
  }

  let subject = `Rentora Notification: ${itemTitle}`;
  let title = 'Rental Notification';
  let badgeText = 'Rental Update';
  let badgeColor = '#4f46e5';
  let summaryText = '';

  const formatPeriod = () => {
    if (!startDate || !endDate) return null;
    try {
      const s = new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const e = new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${s} to ${e}`;
    } catch {
      return null;
    }
  };

  const rentalPeriod = formatPeriod();

  switch (type) {
    case 'RENTAL_REQUEST':
      subject = `📬 New Rental Request for "${itemTitle}" on Rentora`;
      title = 'You Received a Rental Request!';
      badgeText = 'New Request';
      badgeColor = '#4f46e5';
      summaryText = `<strong>${senderName}</strong> has sent you a request to rent <strong>"${itemTitle}"</strong>. Review the request details below and respond on Rentora.`;
      break;

    case 'REQUEST_ACCEPTED':
      subject = `🎉 Great News! Rental Request Accepted for "${itemTitle}"`;
      title = 'Rental Request Accepted!';
      badgeText = 'Request Accepted';
      badgeColor = '#16a34a';
      summaryText = `Good news! <strong>${senderName}</strong> accepted your rental request for <strong>"${itemTitle}"</strong>. You can now chat to coordinate item pickup.`;
      break;

    case 'REQUEST_REJECTED':
      subject = `Update on your rental request for "${itemTitle}"`;
      title = 'Rental Request Update';
      badgeText = 'Request Declined';
      badgeColor = '#dc2626';
      summaryText = reason
        ? `Your request for <strong>"${itemTitle}"</strong> could not be accepted by <strong>${senderName}</strong>. Reason: <em>${reason}</em>`
        : `Your request for <strong>"${itemTitle}"</strong> was declined by <strong>${senderName}</strong>. You can browse other available items on campus.`;
      break;

    case 'RENTAL_CANCELLED':
      subject = `Rental Request Cancelled: "${itemTitle}"`;
      title = 'Rental Request Cancelled';
      badgeText = 'Cancelled';
      badgeColor = '#64748b';
      summaryText = `The rental request for <strong>"${itemTitle}"</strong> has been cancelled by <strong>${senderName}</strong>.`;
      break;

    case 'RENTAL_REMINDER':
      subject = `🔑 Rental Active: Handover Confirmed for "${itemTitle}"`;
      title = 'Handover Confirmed — Rental Active';
      badgeText = 'Active Rental';
      badgeColor = '#d97706';
      summaryText = `Item handover for <strong>"${itemTitle}"</strong> has been verified. Your rental is now in progress. Remember to return the item in good condition before the deadline.`;
      break;

    case 'RENTAL_COMPLETED':
      subject = `✅ Rental Completed: "${itemTitle}"`;
      title = 'Rental Completed!';
      badgeText = 'Completed';
      badgeColor = '#16a34a';
      summaryText = `The rental for <strong>"${itemTitle}"</strong> has been marked COMPLETED. Please take a moment to rate and review your experience!`;
      break;

    default:
      subject = `Rentora Notification: ${itemTitle}`;
      title = 'Rental Notification';
      summaryText = `Update regarding <strong>"${itemTitle}"</strong> from <strong>${senderName}</strong>.`;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; padding: 6px 14px; background-color: #f1f5f9; border-radius: 9999px; font-size: 12px; font-weight: 700; color: ${badgeColor}; text-transform: uppercase; letter-spacing: 0.5px;">
          ${badgeText}
        </span>
        <h2 style="color: #0f172a; margin: 12px 0 6px; font-size: 22px; font-weight: 800;">${title}</h2>
        <p style="color: #64748b; font-size: 14px; margin: 0;">Hi ${recipientName}, you have an update on Rentora</p>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 14px; line-height: 1.6;">
        <p style="margin: 0 0 12px 0; color: #334155;">
          ${summaryText}
        </p>

        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-top: 12px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="color: #64748b; padding: 4px 0; width: 100px;">Item:</td>
              <td style="color: #0f172a; font-weight: 600; padding: 4px 0;">${itemTitle}</td>
            </tr>
            <tr>
              <td style="color: #64748b; padding: 4px 0;">User:</td>
              <td style="color: #0f172a; font-weight: 600; padding: 4px 0;">${senderName}</td>
            </tr>
            ${rentalPeriod ? `
            <tr>
              <td style="color: #64748b; padding: 4px 0;">Period:</td>
              <td style="color: #0f172a; font-weight: 600; padding: 4px 0;">${rentalPeriod}</td>
            </tr>` : ''}
            ${message ? `
            <tr>
              <td style="color: #64748b; padding: 4px 0; vertical-align: top;">Note:</td>
              <td style="color: #334155; font-style: italic; padding: 4px 0;">"${message}"</td>
            </tr>` : ''}
          </table>
        </div>
      </div>

      <div style="text-align: center; margin: 28px 0 20px;">
        <a href="${actionUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
          Open Rentora & View Details →
        </a>
      </div>

      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; line-height: 1.5;">
        You received this notification because of activity related to your Rentora account.<br/>
        Rentora Student Rental Marketplace — NIET Greater Noida
      </p>
    </div>
  `;

  const plainText = `${title}\n\nHi ${recipientName},\n${summaryText.replace(/<[^>]*>?/gm, '')}\n\nItem: ${itemTitle}\nFrom: ${senderName}${rentalPeriod ? `\nDates: ${rentalPeriod}` : ''}${message ? `\nMessage: ${message}` : ''}\n\nView details: ${actionUrl}\n\nRentora — NIET Greater Noida`;

  // Option 1: Send via Resend if API Key available
  if (process.env.RESEND_API_KEY) {
    try {
      const fromEmail = process.env.EMAIL_FROM || '"Rentora Notifications" <notifications@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipientEmail],
          subject,
          text: plainText,
          html,
        }),
      });

      if (res.ok) {
        logger.info(`📧 Rental notification email dispatched to ${recipientEmail} via Resend (${type})`);
        return;
      }
    } catch (err: any) {
      logger.error(`❌ Resend rental notification error: ${err.message}`);
    }
  }

  // Option 2: Send via SMTP
  const smtpTransporter = getTransporter();
  if (smtpTransporter) {
    try {
      await smtpTransporter.sendMail({
        from: `"Rentora Notifications" <${config.SMTP_USER}>`,
        to: recipientEmail,
        subject,
        text: plainText,
        html,
      });
      logger.info(`📧 Rental notification email dispatched to ${recipientEmail} via SMTP (${type})`);
      return;
    } catch (smtpErr: any) {
      logger.error(`❌ Failed to send rental notification via SMTP: ${smtpErr.message}`);
    }
  }

  // Fallback log for development
  logger.info(`📧 [Rental Email Fallback] To: ${recipientEmail} | Subject: ${subject} | Link: ${actionUrl}`);
};

