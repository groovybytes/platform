// @filename: user-management/membership/cleanup-expired-invitations.ts
import type { FunctionHandler, InvocationContext } from '@azure/functions';
import type { Membership } from '~/types/operational';

import { queryItems, patchItem } from '~/utils/cosmos/utils';
import { sendInvitationExpiredEmail } from '~/email/email';
import { readItem } from '~/utils/cosmos/utils';

/**
 * Timer-triggered function to cleanup expired invitations
 * This function runs on a schedule (e.g., every day) to:
 * 1. Find invitations that have expired
 * 2. Update their status to "expired"
 * 3. Send notification emails
 */
const CleanupExpiredInvitationsHandler: FunctionHandler = async function (context: InvocationContext): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Find all pending invitations that have passed their expiration date
    const expiredInvitations = await queryItems<Membership>(
      'membership',
      `SELECT * FROM c 
             WHERE c.status = 'pending' 
             AND c.inviteExpiresAt < @now`,
      [{ name: '@now', value: now }]
    );

    context.log(`Found ${expiredInvitations.length} expired invitations to process`);

    // Process each expired invitation
    for (const invitation of expiredInvitations) {
      try {
        // Update the invitation status to expired
        await patchItem<Membership>(
          'membership',
          invitation.id,
          [{ op: 'replace', path: '/status', value: 'expired' }]
        );

        // Attempt to get user information for email notification
        const user = await readItem('users', invitation.userId);

        if (user && invitation.inviteEmail) {
          // Send expired invitation notification
          await sendInvitationExpiredEmail(
            invitation.inviteEmail,
            user.name || invitation.inviteEmail.split('@')[0]
          );

          context.log(`Sent expiration notification for invitation ${invitation.id} to ${invitation.inviteEmail}`);
        }
      } catch (error) {
        // Log error but continue processing other invitations
        context.error(`Error processing expired invitation ${invitation.id}: ${(error as Error)?.message}`);
      }
    }

    context.log(`Completed expired invitation cleanup: ${expiredInvitations.length} invitations processed`);
  } catch (error) {
    context.error(`Error in cleanupExpiredInvitations function: ${(error as Error)?.message}`);
    throw error;
  }
};

export default {
  Name: "CleanupExpiredInvitations",
  Schedule: "0 0 3 * * *",
  Handler: CleanupExpiredInvitationsHandler,
};