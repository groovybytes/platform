import type { JWTPayload } from "jose";

import { AUTH_SECRET, AUTH_SALT } from "./config";
import { EncryptJWT, jwtDecrypt } from "jose";
import { hkdf } from "@panva/hkdf";

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
 * AUTH_SECRET and AUTH_SALT set as environment variables for the encryption process.
 * The function throws an error if these variables are missing or if JWE generation fails.
 *
 * @param payload The data to encrypt in the JWE.
 * @param maxAge (Optional) The maximum validity period of the JWE in seconds.
 * @returns A promise resolving to the encrypted JWE.
 * @throws An error if the environment variables are missing or if JWE creation fails.
 */
export async function generateJWE(payload: ExtendedJWT, maxAge?: number) {
  if (!AUTH_SECRET) {
    throw new Error('AUTH_SECRET is missing. Unable to proceed with JWT encryption.');
  }

  if (!AUTH_SALT) {
    throw new Error('AUTH_SALT is missing. Unable to proceed with JWT encryption.');
  }

  try {
    const encryptedJWE = await encodePayload({
      payload,
      secret: AUTH_SECRET,
      salt: AUTH_SALT,
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
 * is valid. It uses AUTH_SECRET and AUTH_SALT set as environment variables for the decryption
 * process. The function throws an error if these variables are missing or if JWE decryption fails.
 *
 * @param token The encrypted JWE token to decrypt and validate.
 * @returns A promise resolving to the decrypted and validated payload.
 * @throws An error if the environment variables are missing or if JWE decryption fails.
 */
export async function decryptJWE(token: string): Promise<ExtendedJWT | null> {
  if (!AUTH_SECRET) {
    throw new Error('AUTH_SECRET is missing. Unable to proceed with JWE decryption.');
  }

  if (!AUTH_SALT) {
    throw new Error('AUTH_SALT is missing. Unable to proceed with JWE decryption.');
  }

  try {
    const decryptedPayload = await decodePayload({
      token,
      secret: AUTH_SECRET,
      salt: AUTH_SALT
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
export interface BaseJWT extends JWTPayload {
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
