// @filename: utils/email.ts
import type { EmailMessage } from '@azure/communication-email';
import { EmailClient } from '@azure/communication-email';
import process from 'node:process';

// Cache the email client instance
let emailClientInstance: EmailClient | null = null;

/**
 * Get or create an instance of the Email client
 */
function getEmailClient(): EmailClient {
  if (!emailClientInstance) {
    emailClientInstance = new EmailClient(
      process.env.COMMUNICATION_SERVICES_CONNECTION_STRING as string
    );
  }
  return emailClientInstance;
}

/**
 * Email content with both HTML and plain text versions
 */
export interface EmailContent {
  subject: string;
  htmlBody: string;
  textBody: string;
}

/**
 * Options for sending an email
 */
export interface SendEmailOptions {
  to: string | string[];
  content: EmailContent;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

/**
 * Send an email using Azure Communication Services
 * @param options Email options
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const emailClient = getEmailClient();

  // Convert single recipient to array
  const toRecipients = Array.isArray(options.to)
    ? options.to.map(email => ({ address: email }))
    : [{ address: options.to }];

  // Optional CC recipients
  const ccRecipients = options.cc
    ? (Array.isArray(options.cc)
      ? options.cc.map(email => ({ address: email }))
      : [{ address: options.cc }])
    : undefined;

  // Optional BCC recipients
  const bccRecipients = options.bcc
    ? (Array.isArray(options.bcc)
      ? options.bcc.map(email => ({ address: email }))
      : [{ address: options.bcc }])
    : undefined;

  const message: EmailMessage = {
    senderAddress: process.env.EMAIL_SENDER_ADDRESS as string,
    content: {
      subject: options.content.subject,
      plainText: options.content.textBody,
      html: options.content.htmlBody
    },
    recipients: {
      to: toRecipients,
      ...(ccRecipients && { cc: ccRecipients }),
      ...(bccRecipients && { bcc: bccRecipients })
    },
    ...(options.replyTo && { replyTo: [{ address: options.replyTo }] })
  };

  try {
    await emailClient.beginSend(message);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}
