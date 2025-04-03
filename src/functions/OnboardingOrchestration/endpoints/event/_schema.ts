// @filename: functions/OnboardingOrchestration/endpoints/event/_schema.ts
import { z } from 'zod';

// Create a reusable non-empty string validator
const nonEmptyString = z.string().nonempty({ message: "Value cannot be empty" });

/**
 * Zod schema for "resource.created" event.
 */
export const ResourceCreatedEventSchema = z.object({
  eventType: z.literal('resource.created'),
  resourceId: nonEmptyString,
  resourceType: z.enum(['workspace', 'project']),
});

/**
 * Zod schema for "invitation.accepted" event.
 */
export const InvitationAcceptedEventSchema = z.object({
  eventType: z.literal('invitation.accepted'),
  userId: nonEmptyString,
  membershipId: nonEmptyString,
  resourceType: z.enum(['workspace', 'project']),
  resourceId: nonEmptyString,
});

/**
 * Zod schema for "resource.initialized" event.
 */
export const ResourceInitializedEventSchema = z.object({
  eventType: z.literal('resource.initialized'),
  resourceId: nonEmptyString,
  resourceType: z.enum(['workspace', 'project']),
});

/**
 * Helper function that extends a Zod object with the instanceId field.
 */
const withInstanceId = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({
    instanceId: nonEmptyString,
  });

/**
 * NotificationRequestSchema: discriminated union of all events, each extended with instanceId.
 */
export const NotificationRequestSchema = z.discriminatedUnion('eventType', [
  withInstanceId(ResourceCreatedEventSchema),
  withInstanceId(InvitationAcceptedEventSchema),
  withInstanceId(ResourceInitializedEventSchema),
]);

/**
 * SupportedEventSchema: union of events (without instanceId).
 */
export const SupportedEventSchema = z.discriminatedUnion('eventType', [
  ResourceCreatedEventSchema,
  InvitationAcceptedEventSchema,
  ResourceInitializedEventSchema,
]);

/**
 * Inferred types.
 */
export type SupportedEvent = z.infer<typeof SupportedEventSchema>;
export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;

/**
 * Record mapping eventType to its corresponding Zod schema.
 */
export const SupportedEventSchemas = {
  "resource.created": ResourceCreatedEventSchema,
  "invitation.accepted": InvitationAcceptedEventSchema,
  "resource.initialized": ResourceInitializedEventSchema,
} as const;

/**
 * Mapping type that maps each event's literal eventType to its inferred type.
 */
export type SupportedEventMap = {
  [K in keyof typeof SupportedEventSchemas]: z.infer<typeof SupportedEventSchemas[K]>
};
