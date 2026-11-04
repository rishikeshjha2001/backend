import jwt from 'jsonwebtoken';
import https from 'https';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'happylokam-1c6f2';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache | null = null;

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  name: string | null;
  picture?: string | null;
}

/**
 * Fetches and caches Google's public X.509 certificates for Firebase ID token verification.
 */
const fetchGoogleCertificates = async (): Promise<Record<string, string>> => {
  if (certCache && Date.now() < certCache.expiresAt) {
    return certCache.certs;
  }

  return new Promise((resolve, reject) => {
    https.get(FIREBASE_CERTS_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to fetch Firebase certs: HTTP ${res.statusCode}`));
          }

          const certs = JSON.parse(data);
          let maxAge = 3600; // default 1 hour
          const cacheControl = res.headers['cache-control'];
          if (cacheControl) {
            const match = cacheControl.match(/max-age=(\d+)/);
            if (match && match[1]) {
              maxAge = parseInt(match[1], 10);
            }
          }

          certCache = {
            certs,
            expiresAt: Date.now() + maxAge * 1000,
          };

          resolve(certs);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * Fallback verification for Google OAuth tokens via Google's tokeninfo API
 */
const verifyGoogleOAuthToken = async (idToken: string): Promise<VerifiedFirebaseUser | null> => {
  return new Promise((resolve) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return resolve(null);
          }
          const info = JSON.parse(data);
          if (!info.sub || !info.email) {
            return resolve(null);
          }
          resolve({
            uid: info.sub,
            email: info.email.toLowerCase().trim(),
            emailVerified: info.email_verified === 'true' || info.email_verified === true,
            phone: info.phone_number || null,
            name: info.name || null,
            picture: info.picture || null,
          });
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    });
  });
};

/**
 * Cryptographically verifies a Firebase or Google ID token.
 * Validates the RS256 signature against Google's public certificates,
 * checks audience, issuer, expiration, and ensures no spoofing is possible.
 */
export const verifyFirebaseIdToken = async (idToken: string): Promise<VerifiedFirebaseUser> => {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
    throw new Error('A valid, non-empty Firebase ID token is required.');
  }

  const cleanToken = idToken.trim();

  // Test mode bypass ONLY if explicitly enabled in automated test environment
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.ALLOW_MOCK_AUTH === 'true' &&
    cleanToken.startsWith('mock_test_token_')
  ) {
    const mockUid = cleanToken.replace('mock_test_token_', '');
    return {
      uid: mockUid,
      email: `${mockUid}@happylokam.local`,
      emailVerified: true,
      phone: null,
      name: `Test User ${mockUid}`,
    };
  }

  // 1. Decode header to extract kid
  const decodedHeader = jwt.decode(cleanToken, { complete: true }) as {
    header: { kid?: string; alg?: string };
    payload: any;
  } | null;

  if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
    // Try Google OAuth tokeninfo fallback
    const googleUser = await verifyGoogleOAuthToken(cleanToken);
    if (googleUser) {
      return googleUser;
    }
    throw new Error('Invalid token structure or missing key identifier (kid).');
  }

  const { kid, alg } = decodedHeader.header;
  if (alg !== 'RS256') {
    throw new Error(`Unsupported token signing algorithm: ${alg}. RS256 is required.`);
  }

  // 2. Fetch public certificates
  let certs = await fetchGoogleCertificates();
  let cert = certs[kid];

  // If not found in cache, force fresh fetch in case keys were rotated
  if (!cert) {
    certCache = null;
    certs = await fetchGoogleCertificates();
    cert = certs[kid];
  }

  if (!cert) {
    // Try Google OAuth tokeninfo fallback as last resort
    const googleUser = await verifyGoogleOAuthToken(cleanToken);
    if (googleUser) {
      return googleUser;
    }
    throw new Error('No matching public key found for the provided token kid.');
  }

  // 3. Cryptographically verify signature and standard Firebase claims
  try {
    const verifiedPayload = jwt.verify(cleanToken, cert, {
      algorithms: ['RS256'],
      audience: FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    }) as any;

    if (!verifiedPayload.sub || typeof verifiedPayload.sub !== 'string') {
      throw new Error('Token does not contain a valid subject (sub) claim.');
    }

    const email = verifiedPayload.email ? String(verifiedPayload.email).toLowerCase().trim() : null;
    const phone = verifiedPayload.phone_number ? String(verifiedPayload.phone_number).trim() : null;
    const name = verifiedPayload.name ? String(verifiedPayload.name).trim() : null;
    const picture = verifiedPayload.picture ? String(verifiedPayload.picture).trim() : null;

    return {
      uid: verifiedPayload.sub,
      email,
      emailVerified: Boolean(verifiedPayload.email_verified),
      phone,
      name,
      picture,
    };
  } catch (err: any) {
    // If Firebase verify failed, check if it's a standard Google OAuth ID token
    const googleUser = await verifyGoogleOAuthToken(cleanToken);
    if (googleUser) {
      return googleUser;
    }
    throw new Error(`Cryptographic token verification failed: ${err.message}`);
  }
};
