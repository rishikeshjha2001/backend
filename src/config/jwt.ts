import crypto from 'crypto';

let cachedSecret: string | null = null;

/**
 * Returns a cryptographically secure JWT secret.
 * In production, strictly requires process.env.JWT_SECRET to be defined.
 * In development/test, if process.env.JWT_SECRET is missing, generates a random 256-bit secret
 * per process startup instead of falling back to a static, known hardcoded string.
 */
export const getJwtSecret = (): string => {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL CONFIGURATION ERROR: process.env.JWT_SECRET is required and must be at least 16 characters in production! Process halted for security.'
    );
  }

  if (!cachedSecret) {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[SECURITY WARNING] process.env.JWT_SECRET was not provided. Generated a dynamic, non-deterministic 256-bit secret for this runtime session.'
    );
  }

  return cachedSecret;
};

export const JWT_SECRET = getJwtSecret();
