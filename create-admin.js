const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@happylokam.com';
  const password = 'Rose600@happylokam';
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      name: 'Super Admin',
      email,
      passwordHash,
      role: 'SUPER_ADMIN'
    }
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      name: 'Super Admin',
      email,
      passwordHash,
      role: 'ADMIN',
      referralCode: 'ADMINREF'
    }
  });

  console.log('Account ready:');
  console.log('Email:', admin.email);
  console.log('Password:', password);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
