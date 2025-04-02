import type { ActivityHandler } from 'durable-functions';
import * as df from 'durable-functions';
import { getContainer, patchItem, queryItems } from '~/utils/cosmos';

export interface ProcessInvitesInput {
  userId: string;
  email: string;
}

/**
 * Activity function to process any pending invites for a user
 * - Updates the user's workspace roles based on pending invites
 * - Adds the user to teams they've been invited to
 * - Marks invites as accepted
 */
const ProcessPendingInvites: ActivityHandler = async (input: ProcessInvitesInput): Promise<any[]> => {
  const { userId, email } = input;

  // Connect to Cosmos DB
  const invitesContainer = getContainer("invites");
  const usersContainer = getContainer("users");
  const workspacesContainer = getContainer("workspaces");

  // Find all pending invites for the user's email
  const querySpec = {
    query: `
      SELECT * FROM c 
      WHERE c.email = @email 
      AND c.status = 'pending'
      AND (c.expiresAt = null OR c.expiresAt > @now)
    `,
    parameters: [
      { name: '@email', value: email },
      { name: '@now', value: new Date().toISOString() }
    ]
  };

  const { resources: pendingInvites } = await queryItems(invitesContainer, querySpec.query, querySpec.parameters);
  const timestamp = new Date().toISOString();
  const processedInvites = [];

  // Process each invite
  for (const invite of pendingInvites) {
    try {
      // Update user's workspace roles
      patchItem(usersContainer, userId, [
        {
          op: 'add',
          path: `/roles/workspaces/${invite.workspaceId}`,
          value: [invite.role]
        }
      ], userId);

      // Add user to teams if specified
      if (invite.teamIds && invite.teamIds.length > 0) {
        for (const teamId of invite.teamIds) {
          patchItem(workspacesContainer, invite.workspaceId, [
            {
              op: 'add',
              path: `/teams/${teamId}/members/-`,
              value: userId
            }
          ], invite.workspaceId);
        }
      } else {
        // If no teams specified, add to the default team
        patchItem(workspacesContainer, invite.workspaceId, [
          {
            op: 'add',
            path: `/teams/default/members/-`,
            value: userId
          }
        ], invite.workspaceId);
      }

      // Mark invite as accepted
      patchItem(invitesContainer, invite.id, [
        { op: 'set', path: '/status', value: 'accepted' },
        { op: 'set', path: '/acceptedBy', value: userId },
        { op: 'set', path: '/acceptedAt', value: timestamp }
      ], invite.id);

      processedInvites.push({
        inviteId: invite.id,
        workspaceId: invite.workspaceId,
        status: 'accepted'
      });
    } catch (error) {
      console.error(`Error processing invite ${invite.id}:`, error);
      // Continue with other invites even if one fails
    }
  }

  return processedInvites;
};

// Register the activity
df.app.activity('ProcessPendingInvites', { handler: ProcessPendingInvites });

export default ProcessPendingInvites;