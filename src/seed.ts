import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding HappyLokam Database...\n');

  // ==========================================
  // 1. Create Super Admin
  // ==========================================
  const adminEmail = 'admin@happylokam.com';
  const adminPassword = 'Rose600@happylokam';

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } });
  
  if (!existingAdmin) {
    await prisma.admin.create({
      data: {
        name: 'Super Admin',
        email: adminEmail,
        passwordHash,
        role: 'SUPER_ADMIN'
      }
    });
    console.log('✅ Super Admin created');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
  } else {
    await prisma.admin.update({
      where: { email: adminEmail },
      data: { passwordHash }
    });
    console.log('✅ Super Admin updated with new password');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
  }
  console.log('\n🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
