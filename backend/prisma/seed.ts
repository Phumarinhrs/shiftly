const { PrismaClient } = require('@prisma/client');

// ใช้ DATABASE_URL จาก .env (Postgres หรืออื่นๆ)
const prisma = new PrismaClient();

async function main() {
  const users = [
    { email: 'coordinator@hospital.com', firstName: 'สมชาย', lastName: 'จัดเวร', role: 'COORDINATOR' },
    { email: 'doctor1@hospital.com', firstName: 'วิชัย', lastName: 'รักษาดี', role: 'DOCTOR' },
    { email: 'doctor2@hospital.com', firstName: 'สมหญิง', lastName: 'ใจดี', role: 'DOCTOR' },
    { email: 'doctor3@hospital.com', firstName: 'ประยุทธ์', lastName: 'แก้วใส', role: 'DOCTOR' },
    { email: 'doctor4@hospital.com', firstName: 'นภา', lastName: 'สว่างจิต', role: 'DOCTOR' },
    { email: 'doctor5@hospital.com', firstName: 'กมล', lastName: 'ศรีสุข', role: 'DOCTOR' },
    { email: 'doctor6@hospital.com', firstName: 'พรทิพย์', lastName: 'มั่นคง', role: 'DOCTOR' },
    { email: 'doctor7@hospital.com', firstName: 'อนันต์', lastName: 'สุขใจ', role: 'DOCTOR' },
    { email: 'doctor8@hospital.com', firstName: 'รัตนา', lastName: 'ดีงาม', role: 'DOCTOR' },
    { email: 'doctor9@hospital.com', firstName: 'ธนา', lastName: 'เจริญผล', role: 'DOCTOR' },
    { email: 'doctor10@hospital.com', firstName: 'ปิยะ', lastName: 'สุวรรณ', role: 'DOCTOR' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }

  console.log('Seeded 11 users (1 coordinator + 10 doctors)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
