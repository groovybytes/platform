// @filename: onboarding/activities/save-onboarding-status.ts
import type { ActivityHandler } from 'durable-functions';

import { createItem, patchItem, queryItems } from '~/utils/cosmos';
import { nanoid } from 'nanoid';
import type { PatchOperation } from '@azure/cosmos';

/**
 * Save or update onboarding status in the database
 */
const SaveOnboardingStatusHandler: ActivityHandler = async (status: OnboardingStatus, context) => {
  const { userId } = status;
  
  // Check if status record already exists
  const existingStatuses = await queryItems<OnboardingStatus>(
    'onboarding',
    'SELECT * FROM c WHERE c.userId = @userId AND c.type = @type AND c.status = "in_progress"',
    [
      { name: '@userId', value: userId },
      { name: '@type', value: status.type }
    ]
  );
  
  if (existingStatuses.length > 0) {
    // Update existing status
    const existingStatus = existingStatuses[0];
    await patchItem<OnboardingStatus>(
      'onboarding',
      existingStatus.id,
      [
        { op: 'replace', path: '/status', value: status.status },
        { op: 'replace', path: '/steps', value: status.steps },
        ...(status.completedAt ? [{ op: 'replace', path: '/completedAt', value: status.completedAt }] : []),
        ...(status.resourceId ? [{ op: 'replace', path: '/resourceId', value: status.resourceId }] : []),
        ...(status.resourceType ? [{ op: 'replace', path: '/resourceType', value: status.resourceType }] : [])
      ]
    );
    
    return existingStatus.id;
  } else {
    // Create new status record
    const newStatus = {
      ...status,
      id: nanoid()
    };
    
    await createItem<OnboardingStatus>('onboarding', newStatus);
    return newStatus.id;
  }
};

/**
 * Onboarding status tracking
 */
export interface OnboardingStatus {
  userId: string;
  type: "invite" | "new_workspace" | "new_project";
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt?: string;
  resourceId?: string;
  resourceType?: "workspace" | "project";
  steps: {
    name: string;
    status: "pending" | "completed" | "failed";
    timestamp?: string;
    details?: any;
  }[];
}

// Export the activity definition
export default {
  Name: 'SaveOnboardingStatus',
  Handler: SaveOnboardingStatusHandler,
  Input: {} as OnboardingStatus,
  Output: {} as string
};