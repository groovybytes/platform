// @filename: onboarding/activities/process-pending-invites.ts
import type { ActivityHandler } from 'durable-functions';
import type { Membership } from '~/types/operational';

import { queryItems, patchItem } from '~/utils/cosmos/utils';

export interface ProcessPendingInvitesInput {
  userId: string;
  email: string;
}

interface ProcessPendingInvitesOutput {
  processedCount: number;
  invitations: Membership[];
}

/**
 * Process any pending invites for a user
 */
const ProcessPendingInvitesHandler: ActivityHandler = async (
  input: ProcessPendingInvitesInput, 
  context
) => {
  const { userId, email } = input;
  
  // Find pending invitations by email
  const pendingInvites = await queryItems<Membership>(
    'membership',
    'SELECT * FROM c WHERE c.inviteEmail = @email AND c.status = "pending"',
    [{ name: '@email', value: email }]
  );
  
  if (pendingInvites.length === 0) {
    return {
      processedCount: 0,
      invitations: []
    };
  }
  
  // Update each invitation to point to the user
  const updatedInvites: Membership[] = [];
  
  for (const invite of pendingInvites) {
    // Only update if the user ID is different
    if (invite.userId !== userId) {
      const updated = await patchItem<Membership>(
        'membership',
        invite.id,
        [{ op: 'replace', path: '/userId', value: userId }],
        [invite.resourceType, invite.resourceId]
      );
      
      updatedInvites.push(updated);
    } else {
      updatedInvites.push(invite);
    }
  }
  
  return {
    processedCount: updatedInvites.length,
    invitations: updatedInvites
  };
};

// Export the activity definition
export default {
  Name: 'ProcessPendingInvites',
  Handler: ProcessPendingInvitesHandler,
  Input: {} as ProcessPendingInvitesInput,
  Output: {} as ProcessPendingInvitesOutput
};