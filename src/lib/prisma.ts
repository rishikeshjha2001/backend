import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient — prevents connection pool exhaustion.
 * Every file should import `prisma` from here instead of creating new PrismaClient().
 */

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
