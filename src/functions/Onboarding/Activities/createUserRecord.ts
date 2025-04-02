import type { ActivityHandler } from 'durable-functions';
import type { User } from '~/types/operational.ts';

import * as df from 'durable-functions';
import { getContainer } from '~/utils/cosmos.ts';

export interface CreateUserInput {
  userId: string;
  email: string;
  name?: string;
}

/**
 * Activity function to create or update a user record in Cosmos DB
 */
const CreateUserRecord: ActivityHandler = async (input: CreateUserInput): Promise<User> => {
  const { userId, email, name } = input;

  // Connect to Cosmos DB
  const usersContainer = getContainer("users");

  const timestamp = new Date().toISOString();

  // Prepare user record
  const userRecord: User = {
    id: userId,
    entraId: userId,
    name: name || email.split("@")[0],
    status: "active",
    preferences: {
      language: "en-US",
      timezone: "UTC"
    },
    emails: {
      primary: email,
      all: [email]
    },
    roles: {
      workspaces: {},
      projects: {}
    },
    createdAt: timestamp,
    modifiedAt: timestamp
  };

  // Create or replace the user
  try {
    const { resource: existingUser } = await usersContainer.item(userId, userId).read();
    if (existingUser) {
      // Update existing user
      await usersContainer.item(userId, userId).replace(userRecord);
    } else {
      // Create new user
      await usersContainer.items.create(userRecord);
    }
  } catch (error: any) {
    if (error.code === 404) {
      // User doesn't exist, create it
      await usersContainer.items.create(userRecord);
    } else {
      throw error;
    }
  }

  return userRecord;
};

// Register the activity
const _ActivityName = 'CreateUserRecord';
const _ActivityHandler = CreateUserRecord;
df.app.activity(_ActivityName, { handler: _ActivityHandler });

export type Input = CreateUserInput;
export type Output = User;

export default {
  name: _ActivityName,
  handler: _ActivityHandler,
};