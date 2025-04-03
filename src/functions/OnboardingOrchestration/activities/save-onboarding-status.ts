// @filename: onboarding/activities/save-onboarding-status.ts
import type { OnboardingStatus } from '~/types/operational';
import type { ActivityHandler } from 'durable-functions';
import type { PatchOperation } from '@azure/cosmos';

import { createItem, patchItem, queryItems } from '~/utils/cosmos/utils';
import { nanoid } from 'nanoid';

/**
 * Save or update onboarding status in the database
 */
const SaveOnboardingStatusHandler: ActivityHandler = async (status: OnboardingStatus, context) => {
  const { id } = status;
  
  // Check if status record already exists
  const existingStatuses = await queryItems<OnboardingStatus>(
    'onboarding',
    'SELECT * FROM c WHERE c.id = @id AND c.type = @type AND c.status = "in_progress"',
    [
      { name: '@id', value: id },
      { name: '@type', value: status.type }
    ]
  );
  
  if (existingStatuses.length > 0) {
    // Update existing status
    const existingStatus = existingStatuses[0];

    const completedAt: PatchOperation[] = (status.completedAt ? [{ op: 'replace', path: '/completedAt', value: status.completedAt }] : []);
    const resourceId: PatchOperation[] = (status.resourceId ? [{ op: 'replace', path: '/resourceId', value: status.resourceId }] : []);
    const resourceType: PatchOperation[] = (status.resourceType ? [{ op: 'replace', path: '/resourceType', value: status.resourceType }] : []);

    await patchItem<OnboardingStatus>(
      'onboarding',
      existingStatus.id,
      [
        { op: 'replace', path: '/status', value: status.status },
        { op: 'replace', path: '/steps', value: status.steps },
        { op: 'replace', path: '/orchestrationId', value: status.orchestrationId },
        { op: 'replace', path: '/modifiedAt', value: new Date().toISOString() },
        ...completedAt,
        ...resourceId,
        ...resourceType
      ]
    );
    
    return existingStatus.userId;
  } else {
    // Create new status record
    const newStatus: OnboardingStatus = {
      ...status,
      id: status?.id ?? nanoid(),
      createdAt: status?.createdAt ?? new Date().toISOString(),
      modifiedAt: status?.modifiedAt ?? new Date().toISOString(),
      status: status?.status ?? 'in_progress',
      steps: status.steps || [],
    };
    
    await createItem<OnboardingStatus>('onboarding', newStatus);
    return newStatus.id;
  }
};

// Export the activity definition
export default {
  Name: 'SaveOnboardingStatus',
  Handler: SaveOnboardingStatusHandler,
  Input: {} as OnboardingStatus,
  Output: {} as string
};