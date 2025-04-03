import type { ActivityHandler } from 'durable-functions';
import * as df from 'durable-functions';
import { EmailClient } from '@azure/communication-email';

export interface ReminderEmailInput {
  userId: string;
  email: string;
  name: string;
  attempt: number;
  maxAttempts: number;
}

/**
 * Activity function to send a reminder email for workspace creation
 */
const SendReminderEmail: ActivityHandler = async (input: ReminderEmailInput): Promise<void> => {
  const { userId, email, name, attempt, maxAttempts } = input;
  
  // Get email client
  const emailClient = new EmailClient(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING!);
  
  // Create a more urgent message based on attempt number
  const remainingAttempts = maxAttempts - attempt;
  const urgencyLevel = attempt === 1 ? 'gentle' : attempt === 2 ? 'moderate' : 'urgent';
  
  let subject, message;
  
  switch (urgencyLevel) {
    case 'gentle':
      subject = 'Reminder: Complete Your Workspace Setup';
      message = `<p>Hello ${name},</p>
                <p>We noticed you haven't created your workspace yet. Setting up your workspace is a quick process that will help you get the most out of our platform.</p>
                <p>Ready to get started?</p>`;
      break;
    case 'moderate':
      subject = 'Action Required: Your Workspace Setup is Pending';
      message = `<p>Hello ${name},</p>
                <p>This is your second reminder that your workspace setup is still pending. Your onboarding process won't be complete until you create a workspace.</p>
                <p>It only takes a minute to get set up:</p>`;
      break;
    case 'urgent':
      subject = 'Final Reminder: Complete Your Workspace Setup Soon';
      message = `<p>Hello ${name},</p>
                <p><strong>Important notice:</strong> Your onboarding process will be automatically cancelled in ${remainingAttempts === 1 ? 'one more day' : `${remainingAttempts} days`} if you don't create a workspace.</p>
                <p>Please complete this final step to activate your account:</p>`;
      break;
  }
  
  await emailClient.beginSend({
    senderAddress: process.env.EMAIL_SENDER_ADDRESS!,
    content: {
      subject: subject,
      plainText: `
                Hello ${name},
                
                ${subject}
                
                To create your workspace, please visit: ${process.env.APP_BASE_URL}/workspaces/new
                
                Need help? Reply to this email or contact our support team.
                
                Best regards,
                The Platform Team
            `,
      html: `
                ${message}
                
                <p><a href="${process.env.APP_BASE_URL}/workspaces/new" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Create Workspace Now</a></p>
                
                <p>Need help? Reply to this email or contact our support team.</p>
                
                <p>Best regards,<br>The Platform Team</p>
            `
    },
    recipients: {
      to: [{ address: email }]
    }
  });
};

// Register the activity
df.app.activity('SendReminderEmail', { handler: SendReminderEmail });

export default SendReminderEmail;