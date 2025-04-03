// @filename: utils/email-templates.ts
import type { EmailContent } from '~/utils/email';

/**
 * Templates for welcome email
 */
export function getWelcomeEmailContent(name: string, appBaseUrl: string): EmailContent {
  const subject = 'Welcome to our Platform!';
  
  return {
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
  };
}

/**
 * Templates for invitation email
 */
export function getInvitationEmailContent(
  workspaceName: string, 
  inviteLink: string, 
  isReminder: boolean = false,
  reminderCount: number = 0
): EmailContent {
  // Customize subject based on whether this is a reminder
  const subject = isReminder
    ? `Reminder: You've been invited to join ${workspaceName}`
    : `You've been invited to join ${workspaceName}`;
  
  // Create custom message based on whether this is a reminder
  let reminderMessage = '';
  if (isReminder) {
    if (reminderCount === 1) {
      reminderMessage = `<p><em>This is a friendly reminder about your invitation.</em></p>`;
    } else {
      reminderMessage = `<p><em>This is reminder #${reminderCount} about your pending invitation. Please respond soon to ensure your access.</em></p>`;
    }
  }
  
  return {
    subject,
    htmlBody: `
      ${reminderMessage}
      <p>You've been invited to join <strong>${workspaceName}</strong> on our platform.</p>
      
      <p>Click the button below to accept this invitation and get started:</p>
      
      <p><a href="${inviteLink}" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Accept Invitation</a></p>
      
      <p>If you have any questions, please contact the person who invited you.</p>
      
      <p>Best regards,<br>The Platform Team</p>
    `,
    textBody: `
      ${isReminder ? `Reminder: This invitation is still pending your response.` : ''}
      
      You've been invited to join ${workspaceName} on our platform.
      
      Use the following link to accept this invitation and get started:
      ${inviteLink}
      
      If you have any questions, please contact the person who invited you.
      
      Best regards,
      The Platform Team
    `
  };
}

/**
 * Templates for workspace reminder emails
 */
export function getWorkspaceReminderEmailContent(
  name: string,
  appBaseUrl: string,
  attempt: number,
  maxAttempts: number
): EmailContent {
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

  return {
    subject,
    htmlBody: `
      ${message}
      <p><a href="${appBaseUrl}/workspaces/new" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Create Workspace Now</a></p>
      <p>Need help? Reply to this email or contact our support team.</p>
      <p>Best regards,<br>The Platform Team</p>
    `,
    textBody: `
      Hello ${name},
      
      ${subject}
      
      To get started, you can create your first workspace by visiting:
      ${appBaseUrl}/workspaces/new

      Best regards,
      The Platform Team
    `
  };
}

/**
 * Templates for abandoned onboarding emails
 */
export function getOnboardingAbandonedEmailContent(
  name: string,
  type: 'workspace' | 'project' | 'invite'
): EmailContent {
  let subject: string;
  let message: string;

  switch (type) {
    case 'workspace':
      subject = 'Your Workspace Setup Has Been Cancelled';
      message = `
        <p>Hello ${name},</p>
        <p>We noticed that you haven't completed your workspace setup after several reminders.</p>
        <p>Your onboarding process has been cancelled. If you'd still like to use our platform, please sign in again and complete the workspace creation process.</p>
      `;
      break;
    case 'project':
      subject = 'Your Project Setup Has Been Cancelled';
      message = `
        <p>Hello ${name},</p>
        <p>We noticed that you haven't completed your project setup after several reminders.</p>
        <p>Your project setup process has been cancelled. You can still create a new project by signing in to your workspace.</p>
      `;
      break;
    case 'invite':
      subject = 'Your Invitation Has Expired';
      message = `
        <p>Hello ${name},</p>
        <p>The invitation you received to join our platform has expired after multiple reminders.</p>
        <p>If you're still interested in joining, please contact the person who invited you to send a new invitation.</p>
      `;
      break;
  }

  return {
    subject,
    htmlBody: `
      ${message}
      <p>If you have any questions or need assistance, please contact our support team.</p>
      <p>Best regards,<br>The Platform Team</p>
    `,
    textBody: `
      Hello ${name},
      
      ${subject}
      
      ${type === 'workspace' 
        ? 'Your onboarding process has been cancelled. If you\'d still like to use our platform, please sign in again and complete the workspace creation process.'
        : type === 'project'
          ? 'Your project setup process has been cancelled. You can still create a new project by signing in to your workspace.'
          : 'The invitation you received to join our platform has expired after multiple reminders. If you\'re still interested in joining, please contact the person who invited you to send a new invitation.'
      }
      
      If you have any questions or need assistance, please contact our support team.
      
      Best regards,
      The Platform Team
    `
  };
}