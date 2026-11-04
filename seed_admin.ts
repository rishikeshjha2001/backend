import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@happylokam.com';
  const password = 'admin';

  let admin = await prisma.admin.findUnique({ where: { email: adminEmail } });

  if (!admin) {
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    admin = await prisma.admin.create({
      data: {
        name: 'Super Admin',
        email: adminEmail,
        passwordHash,
        role: 'SUPER_ADMIN',
      },
    });
    console.log('Admin created:', adminEmail);
  } else {
    // Force update password to ensure we know it
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    await prisma.admin.update({
      where: { email: adminEmail },
      data: { passwordHash }
    });
    console.log('Admin already exists, password updated to "admin" for:', adminEmail);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
