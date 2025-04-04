

import { sendEmail } from '~/utils/email';
import { 
    getWelcomeEmailContent,
    getInvitationEmailContent,
    getWorkspaceReminderEmailContent,
    getOnboardingAbandonedEmailContent
  } from './templates';
import { FRONTEND_BASE_URL } from '~/utils/config';

  /**
   * Send a welcome email to a newly onboarded user
   * @param email User's email address
   * @param name User's name
   */
  export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
    const content = getWelcomeEmailContent(name, FRONTEND_BASE_URL);
  
    await sendEmail({
      to: email,
      content
    });
  }
  
  /**
   * Send a workspace invitation email
   * @param email Recipient's email
   * @param workspaceName Name of the workspace
   * @param inviteLink Invitation link
   * @param isReminder Whether this is a reminder email
   * @param reminderCount If this is a reminder, which reminder number
   */
  export async function sendInvitationEmail(
    email: string, 
    workspaceName: string,
    inviteLink: string,
    isReminder: boolean = false,
    reminderCount: number = 0
  ): Promise<void> {
    const content = getInvitationEmailContent(workspaceName, inviteLink, isReminder, reminderCount);
  
    await sendEmail({
      to: email,
      content
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
    const content = getWorkspaceReminderEmailContent(name, FRONTEND_BASE_URL, attempt, maxAttempts);
  
    await sendEmail({
      to: email,
      content
    });
  }
  
  /**
   * Send a notification that onboarding has been abandoned
   * @param email User's email
   * @param name User's name
   * @param type Type of onboarding that was abandoned
   */
  export async function sendOnboardingAbandonedEmail(
    email: string,
    name: string,
    type: 'workspace' | 'project' | 'invite'
  ): Promise<void> {
    const content = getOnboardingAbandonedEmailContent(name, type);
  
    await sendEmail({
      to: email,
      content
    });
  }
  
  /**
   * Send a notification that an invitation has expired
   * @param email User's email
   * @param name User's name
   */
  export async function sendInvitationExpiredEmail(
    email: string,
    name: string
  ): Promise<void> {
    return sendOnboardingAbandonedEmail(email, name, 'invite');
  }
  