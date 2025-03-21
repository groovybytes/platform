import type { WorkspaceRole, User } from '~/types/operational.ts';
import type { HttpRequest } from '@azure/functions';
import type { JWTPayload } from "jose";

import { EncryptJWT, jwtDecrypt, decodeJwt } from "jose";
import { readItem, queryItems } from './cosmos.ts';
import { hkdf } from "@panva/hkdf";

import process from "node:process";

/**
 * Extracts a JWT token from the Authorization header.
 * 
 * @param headers The HTTP request headers.
 * @returns The extracted JWT token, if present; otherwise, null.
 */
export function extractTokenFromHeaders(headers: Headers): string | null {
  const authorizationHeader = headers.get("Authorization") || "";
  const tokenMatch = authorizationHeader.match(/^Bearer (.+)$/);
  return tokenMatch ? tokenMatch[1] : null;
}

/**
 * Extract user ID from Azure AD token
 * @param req HTTP request with authorization header
 */
export function getUserIdFromToken(req: HttpRequest): string {
  // In a real implementation, this would validate the JWT token
  // and extract the user ID from claims

  // For Azure AD B2C, typically use the oid claim
  // Example implementation:
  const token = extractTokenFromHeaders(req.headers as Headers);
  if (!token) {
    throw new Error('No authorization token provided');
  }

  // In a production environment, you would verify the token
  // using jsonwebtoken or a similar library
  const decodedToken = decodeJwt(token);

  if (!decodedToken.oid) {
    throw new Error('Invalid token: missing user ID claim');
  }

  return decodedToken.oid as string;
}

/**
 * Check if user has any access to workspace
 * @param userId User ID
 * @param workspaceId Workspace ID
 */
export async function hasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  try {
    // Check if user has any roles in the workspace
    const user = await readItem<User>('users', userId);

    // Check workspace role assignments
    if (user.roles?.workspaces?.[workspaceId]?.length > 0) {
      return true;
    }

    // Check team memberships
    const workspace = await readItem('workspaces', workspaceId);

    for (const teamId in workspace.teams) {
      if (workspace.teams[teamId].members.includes(userId)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking workspace access:', error);
    return false;
  }
}

/**
 * Check if user has specific workspace role(s)
 * @param userId User ID
 * @param workspaceId Workspace ID
 * @param roles Array of roles to check
 */
export async function hasWorkspaceRole(
  userId: string,
  workspaceId: string,
  roles: WorkspaceRole[]
): Promise<boolean> {
  try {
    const user = await readItem<User>('users', userId);
    const userRoles = user.roles?.workspaces?.[workspaceId] || [];
    return userRoles.some(role => roles.includes(role as WorkspaceRole));
  } catch (error) {
    console.error('Error checking workspace role:', error);
    return false;
  }
}

/**
 * Get all roles a user has in a workspace
 * @param userId User ID
 * @param workspaceId Workspace ID
 */
export async function getUserWorkspaceRoles(
  userId: string,
  workspaceId: string
): Promise<WorkspaceRole[]> {
  try {
    const user = await readItem<User>('users', userId);
    return (user.roles?.workspaces?.[workspaceId] || []) as WorkspaceRole[];
  } catch (error) {
    console.error('Error getting user workspace roles:', error);
    return [];
  }
}

// Retrieve JWT-related secrets and salts from environment variables
export const JWT_SECRET = process.env.PRIVATE_JWT_SECRET;
export const JWT_SALT = process.env.PRIVATE_JWT_SALT;

// Default token expiration time set to 30 days
export const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// Function to get the current time in seconds since Epoch
export const getCurrentTimeInSeconds = () => (Date.now() / 1000) | 0;

/**
 * Derives an encryption key using HKDF.
 * 
 * @param initialKey The initial key material for HKDF.
 * @param salt The salt value for HKDF.
 * @returns A promise that resolves to the derived encryption key.
 */
export function deriveEncryptionKey(initialKey: string | Uint8Array, salt: string | Uint8Array) {
  if (!initialKey) {
    throw new Error('initialKey material is missing. Unable to proceed with derived encryption key generation.');
  }

  if (!salt) {
    throw new Error('salt is missing. Unable to proceed with derived encryption key generation.');
  }

  return hkdf("sha256", initialKey, salt, `Encryption Key Derivation (${salt})`, 32);
}

/**
 * Encodes and encrypts a payload into a signed JWE (JSON Web Encryption).
 * 
 * @param params Parameters for encoding the payload into a JWT.
 * @returns A promise that resolves to the encoded and encrypted JWT.
 */
// TODO: Consider moving to asymmetric public and private key encryption and verification for enhanced security.
export async function encodePayload<Payload = ExtendedJWT>(params: EncodeParams<Payload>) {
  const { payload = {}, secret, salt, maxAge = DEFAULT_MAX_AGE } = params;

  const encryptionKey = await deriveEncryptionKey(secret, salt);
  const token = await new EncryptJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(getCurrentTimeInSeconds() + maxAge)
    .setJti(crypto.randomUUID())
    .encrypt(encryptionKey);

  if (!token) {
    throw new Error("Failed to generate encrypted JWT.");
  }

  return token;
}

/**
 * Decodes and decrypts a signed JWE.
 * 
 * @param params Parameters for decoding the JWT.
 * @returns The decoded payload of the JWT, or null if token is not provided.
 */
export async function decodePayload<Payload = ExtendedJWT>(
  params: DecodeParams
): Promise<Payload | null> {
  const { token, secret, salt } = params;
  if (!token) return null;

  const decryptionKey = await deriveEncryptionKey(secret, salt);
  const { payload } = await jwtDecrypt(token, decryptionKey, {
    clockTolerance: 15
  });

  return payload as Payload;
}

/**
 * Generates an encrypted JSON Web Token (JWE).
 *
 * This function encrypts data into a JWE, ensuring secure transmission. It relies on
 * JWT_SECRET and JWT_SALT set as environment variables for the encryption process.
 * The function throws an error if these variables are missing or if JWE generation fails.
 *
 * @param payload The data to encrypt in the JWE.
 * @param maxAge (Optional) The maximum validity period of the JWE in seconds.
 * @returns A promise resolving to the encrypted JWE.
 * @throws An error if the environment variables are missing or if JWE creation fails.
 */
export async function generateJWE(payload: ExtendedJWT, maxAge?: number) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Unable to proceed with JWT encryption.');
  }

  if (!JWT_SALT) {
    throw new Error('JWT_SALT is missing. Unable to proceed with JWT encryption.');
  }

  try {
    const encryptedJWE = await encodePayload({
      payload,
      secret: JWT_SECRET,
      salt: JWT_SALT,
      maxAge
    });

    if (!encryptedJWE) {
      throw new Error('Failed to generate an encrypted JWE.');
    }

    return encryptedJWE;
  } catch (error) {
    console.error('Error while generating an encrypted JWE:', error);
    throw new Error('An error occurred while generating the encrypted JWE.', {
      cause: error
    });
  }
}

/**
 * Decrypts and validates an encrypted JSON Web Token (JWE).
 *
 * This function takes an encrypted JWE token, decrypts it, and ensures that the data
 * is valid. It uses JWT_SECRET and JWT_SALT set as environment variables for the decryption
 * process. The function throws an error if these variables are missing or if JWE decryption fails.
 *
 * @param token The encrypted JWE token to decrypt and validate.
 * @returns A promise resolving to the decrypted and validated payload.
 * @throws An error if the environment variables are missing or if JWE decryption fails.
 */
export async function decryptJWE(token: string): Promise<ExtendedJWT | null> {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Unable to proceed with JWE decryption.');
  }

  if (!JWT_SALT) {
    throw new Error('JWT_SALT is missing. Unable to proceed with JWE decryption.');
  }

  try {
    const decryptedPayload = await decodePayload({
      token,
      secret: JWT_SECRET,
      salt: JWT_SALT
    });

    if (!decryptedPayload) {
      throw new Error('Failed to decrypt or validate the JWE.');
    }

    return decryptedPayload;
  } catch (error) {
    console.error('Error while decrypting and validating the JWE:', error);
    throw new Error('An error occurred during JWE decryption and validation.', {
      cause: error
    });
  }
}

/**
 * Interfaces to define the structure of the JWT (JSON Web Token) payload.
 * This includes standard JWT fields as well as additional user-related information.
 */
export interface BaseJWT {
  /**
   * User's name. This is typically provided by the authentication provider
   * and can be null if the name is not available or not provided.
   */
  name?: string | null;

  /**
   * User's email address. Similar to the name, this is provided by the authentication provider.
   * It can be null if the email is not available or not provided.
   */
  email?: string | null;

  /**
   * URL to the user's picture or avatar. This is usually provided by the authentication provider.
   * Can be null if not available.
   */
  picture?: string | null;

  /**
   * The 'sub' (subject) claim identifies the principal that is the subject of the JWT.
   * This is typically a user identifier (like a user ID) unique to the user.
   */
  sub?: string;

  /**
   * Issued At Claim. The 'iat' claim indicates the time at which the JWT was issued.
   * It is represented as the number of seconds since Epoch (January 1, 1970, UTC).
   */
  iat?: number;

  /**
   * Expiration time claim. The 'exp' claim identifies the expiration time on or after which
   * the JWT MUST NOT be accepted for processing. It's also a number of seconds since Epoch.
   */
  exp?: number;

  /**
   * JWT ID claim. The 'jti' claim provides a unique identifier for the JWT.
   * It can be used to prevent the JWT from being replayed (i.e., used more than once).
   */
  jti?: string;
}

/**
 * Extended JWT interface that includes any other properties that might be needed,
 * in addition to the standard ones defined in BaseJWT.
 */
export interface ExtendedJWT extends Record<string, unknown>, BaseJWT { }

/**
 * Parameters required for JWT encoding and decoding
 */
export interface EncodeParams<Payload = ExtendedJWT> {
  /**
   * The payload to be encoded in the JWT.
   */
  payload?: Payload;

  /**
   * The maximum age in seconds for the JWT. Default is set to 30 days.
   */
  maxAge?: number;

  /**
   * The salt used in combination with `secret` to derive the encryption key for JWTs.
   */
  salt: string;

  /**
   * The secret used in combination with `salt` to derive the encryption key for JWTs.
   */
  secret: string;
}

/**
 * Parameters for decoding a JWT.
 */
export interface DecodeParams {
  /**
   * The JWT token issued by Auth.js that needs to be decoded.
   */
  token?: string;

  /**
   * The salt used in combination with `secret` to derive the encryption key for JWTs.
   */
  salt: string;

  /**
   * The secret used in combination with `salt` to derive the encryption key for JWTs.
   */
  secret: string;
}
