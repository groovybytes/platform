import type { User } from "~/types/operational";

/**
 * Sanitize user object to remove sensitive data
 */
export function sanitizeUserResponse(user: User): Partial<User> {
    // Only return safe user fields
    const { id, name, status, preferences, emails, createdAt, modifiedAt } = user;
    return { id, name, status, preferences, emails, createdAt, modifiedAt };
  }