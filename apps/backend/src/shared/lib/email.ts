import { logger } from './logger';

let resendClient: any = null;

function getClient(): any {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const { Resend } = require('resend');
        resendClient = new Resend(apiKey);
      } catch {
        logger.warn('[EMAIL] Failed to initialize Resend client');
      }
    }
  }
  return resendClient;
}

// Email is always enabled in production. Off in test. In development it is off
// by default so we don't spam real inboxes; set SEND_EMAILS_IN_DEV=true to
// actually deliver via Resend (same idea as SEND_PUSH_IN_DEV).
function isEmailEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.NODE_ENV === 'test') return false;
  return process.env.SEND_EMAILS_IN_DEV === 'true';
}

export async function sendEmail(email: string, subject: string, html: string): Promise<boolean> {
  if (!isEmailEnabled()) {
    logger.info('[EMAIL] skipped (dev)', email, '|', subject);
    return true;
  }

  const client = getClient();
  if (!client) {
    logger.warn('[EMAIL] Resend not configured — email not sent');
    return false;
  }

  try {
    const result = await client.emails.send({
      from: process.env.EMAIL_FROM ?? 'Lifty <noreply@lifty.app>',
      to: email,
      subject,
      html,
    });

    // Resend SDK returns { data, error } instead of throwing on API failures.
    if (result?.error) {
      logger.error(
        '[EMAIL] Send failed to',
        email,
        ':',
        result.error.message ?? JSON.stringify(result.error),
      );
      return false;
    }

    logger.info('[EMAIL] Sent to', email, result?.data?.id ? `(id=${result.data.id})` : '');
    return true;
  } catch (err) {
    logger.error('[EMAIL] Send failed to', email, ':', (err as Error).message);
    return false;
  }
}
