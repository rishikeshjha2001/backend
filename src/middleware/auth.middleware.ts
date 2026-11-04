import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { getJwtSecret } from '../config/jwt';

const getSecret = () => getJwtSecret();

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        email: string;
      };
    }
  }
}

/**
 * Extracts and verifies JWT from Authorization header or accessToken cookie.
 * Attaches decoded user to req.user
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2. Check cookie
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please login.' });
    }

    // 3. Verify JWT
    const decoded = jwt.verify(token, getSecret()) as { id: string; role: string; email: string };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token. Please login again.' });
  }
};

/**
 * Optional authentication: decodes user if token exists, otherwise proceeds as guest
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    if (token) {
      const decoded = jwt.verify(token, getSecret()) as { id: string; role: string; email: string };
      req.user = decoded;
    }
  } catch (error) {
    // Guest access, proceed cleanly
  }
  next();
};

/**
 * Requires the user to have ADMIN or SUPER_ADMIN role
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }
    next();
  });
};

/**
 * Requires the user to have PARTNER role
 */
export const requirePartner = (req: Request, res: Response, next: NextFunction) => {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'PARTNER') {
      return res.status(403).json({ success: false, error: 'Partner access required.' });
    }
    next();
  });
};

/**
 * Requires the user to have MANAGER role
 */
export const requireManager = (req: Request, res: Response, next: NextFunction) => {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'MANAGER' && req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Manager access required.' });
    }
    next();
  });
};

export { getJwtSecret };
