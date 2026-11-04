import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const auditAdminAction = (actionName: string, getResource: (req: Request) => string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // We only want to log on successful responses. We can intercept the send method.
    const originalSend = res.send;
    let logged = false;

    res.send = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300 && !logged) {
        logged = true;
        
        const adminId = req.user?.id;
        const resource = getResource(req);
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

        if (adminId) {
          prisma.auditLog.create({
            data: {
              adminId,
              action: actionName,
              resource,
              ip: String(ip),
              metadata: req.body // Safe to log payload (ensure no passwords in body for these routes)
            }
          }).catch(err => console.error('Failed to write audit log:', err));
        }
      }
      return originalSend.apply(this, [body]);
    };

    next();
  };
};
