import { EmailClient, type EmailMessage } from '@azure/communication-email';

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

/**
 * Send a welcome email to a newly onboarded user
 * @param email User's email address
 * @param name User's name
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const appBaseUrl = process.env.APP_BASE_URL as string;
  const subject = 'Welcome to our Platform!';

  await sendEmail({
    to: email,
    content: {
      subject,
      htmlBody: `
        <p>Hello ${name},</p>
        
        <p>Welcome to our platform! We're excited to have you on board.</p>
        
        <p>To get started, you can create your first workspace by clicking the button below.</p>
        
        <p><a href="${appBaseUrl}/workspaces/new" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Create Workspace</a></p>
        
        <p>Best regards,<br>The Platform Team</p>
      `,
      textBody: `
        Hello ${name},
        
        ${subject}
        
        To create your workspace, please visit:
        ${appBaseUrl}/workspaces/new
        
        Need help? Reply to this email or contact our support team.
        
        Best regards,
        The Platform Team
    `
    }
  });
}

/**
 * Send a workspace invitation email
 * @param email Recipient's email
 * @param resourceName Name of the workspace
 * @param inviteLink Invitation link
 */
export async function sendInvitationEmail(
  email: string, 
  resourceName: string,
  inviteLink: string
): Promise<void> {
  await sendEmail({
    to: email,
    content: {
      subject: `You've been invited to join ${resourceName}`,
      htmlBody: `
        <p>You've been invited to join <strong>${resourceName}</strong> on our platform.</p>
        
        <p>Click the button below to accept this invitation and get started:</p>
        
        <p><a href="${inviteLink}" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Accept Invitation</a></p>
        
        <p>If you have any questions, please contact the person who invited you.</p>
        
        <p>Best regards,<br>The Platform Team</p>
      `,
    textBody: `
        You've been invited to join ${resourceName} on our platform.
        
        Use the following link to accept this invitation and get started:
        ${inviteLink}
        
        If you have any questions, please contact the person who invited you.
        
        Best regards,
        The Platform Team
      `
    }
  });
}

/**
 * Send a reminder email for workspace creation
 * @param email User's email
 * @param name User's name
 * @param attempt Current reminder attempt number
 * @param maxAttempts Maximum number of attempts
 */
export async function sendWorkspaceReminderEmail(
  email: string,
  name: string,
  attempt: number,
  maxAttempts: number
): Promise<void> {
  const appBaseUrl = process.env.APP_BASE_URL as string;
  const remainingAttempts = maxAttempts - attempt;
  const urgencyLevel = attempt === 1 ? 'gentle' : attempt === 2 ? 'moderate' : 'urgent';

  let subject: string;
  let message: string;

  switch (urgencyLevel) {
    case 'gentle':
      subject = 'Reminder: Complete Your Workspace Setup';
      message = `
        <p>Hello ${name},</p>
        <p>We noticed you haven't created your workspace yet. Setting up your workspace is a quick process that will help you get the most out of our platform.</p>
        <p>Ready to get started?</p>
      `;
      break;
    case 'moderate':
      subject = 'Action Required: Your Workspace Setup is Pending';
      message = `
        <p>Hello ${name},</p>
        <p>This is your second reminder that your workspace setup is still pending. Your onboarding process won't be complete until you create a workspace.</p>
        <p>It only takes a minute to get set up:</p>
      `;
      break;
    case 'urgent':
      subject = 'Final Reminder: Complete Your Workspace Setup Soon';
      message = `
        <p>Hello ${name},</p>
        <p><strong>Important notice:</strong> Your onboarding process will be automatically cancelled in ${remainingAttempts === 1 ? 'one more day' : `${remainingAttempts} days`} if you don't create a workspace.</p>
        <p>Please complete this final step to activate your account:</p>
      `;
      break;
  }

  await sendEmail({
    to: email,
    content: {
      subject,
      htmlBody: `
        ${message}
        <p><a href="${appBaseUrl}/workspaces/new" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Create Workspace Now</a></p>
        <p>Need help? Reply to this email or contact our support team.</p>
        <p>Best regards,<br>The Platform Team</p>
      `,
      textBody: `
        Hello ${name},
        
        Welcome to our platform! We're excited to have you on board.
        
        To get started, you can create your first workspace by visiting:
        ${appBaseUrl}/workspaces/new

        Best regards,
        The Platform Team
      `
    }
  })
}