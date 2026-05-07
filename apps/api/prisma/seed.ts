import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function migrateLegacyDefaultAccounts() {
  const legacyAccounts = [
    ['admin@example.com', 'admin'],
    ['manager@example.com', 'manager'],
    ['finance@example.com', 'finance'],
    ['kiki@example.com', 'kiki'],
    ['hailey@example.com', 'hailey'],
    ['employee@example.com', 'employee'],
  ];

  for (const [legacy, account] of legacyAccounts) {
    const oldUser = await prisma.user.findUnique({ where: { email: legacy } });
    if (!oldUser) continue;
    const newUser = await prisma.user.findUnique({ where: { email: account } });
    if (newUser) {
      await prisma.user.update({
        where: { id: oldUser.id },
        data: { email: `legacy-${oldUser.id}`, isActive: false },
      });
    } else {
      await prisma.user.update({ where: { id: oldUser.id }, data: { email: account } });
    }
  }
}

async function upsertUser(email: string, name: string, role: Role, managerId?: number) {
  const passwordHash = await bcrypt.hash('123456', 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, managerId, passwordHash, isActive: true },
    create: { email, name, role, managerId, passwordHash },
  });
}

async function main() {
  await migrateLegacyDefaultAccounts();
  const admin = await upsertUser('admin', 'Admin', Role.ADMIN);
  const manager = await upsertUser('manager', 'Manager', Role.MANAGER);
  await upsertUser('finance', 'Finance', Role.FINANCE);
  await upsertUser('kiki', 'Kiki', Role.CC);
  await upsertUser('hailey', 'Hailey', Role.CC);
  await upsertUser('employee', 'Foreign Employee', Role.EMPLOYEE, manager.id);
  console.log(`Seeded users. Admin id: ${admin.id}`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
