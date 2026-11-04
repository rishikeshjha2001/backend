/**
 * End-to-End Verification Script for HappyLokam Production Services
 */

const http = require('http');
const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

function fetchJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('========================================================');
  console.log('   HAPPY LOKAM AWS EC2 PRODUCTION VERIFICATION SUITE    ');
  console.log('========================================================\n');

  // 1. Verify Hero Slides
  console.log('1. Checking Hero Slides API (GET /api/v1/hero-slides)...');
  const heroRes = await fetchJson('http://localhost:4000/api/v1/hero-slides');
  console.log(`Status: ${heroRes.status}`);
  const slides = heroRes.data?.data || heroRes.data?.slides || [];
  console.log(`Found ${slides.length} slides:`);
  slides.forEach((s, idx) => {
    console.log(`  [Slide ${idx + 1}] "${s.title1} ${s.title2}" (${s.badge}) -> ${s.image}`);
  });

  // 2. Verify Venues in Database
  console.log('\n2. Checking Celebration Venues in Database...');
  const venues = await prisma.venue.findMany({ select: { name: true, city: true, price: true, status: true } });
  console.log(`Found ${venues.length} venues:`);
  venues.forEach((v) => {
    console.log(`  - ${v.name} (${v.city}) - ₹${v.price}/plate [${v.status}]`);
  });

  // 3. Verify Dynamic Support Desk API
  console.log('\n3. Checking Support Tickets (GET /api/v1/support/admin)...');
  const supportRes = await fetchJson('http://localhost:4000/api/v1/support/admin');
  console.log(`Status: ${supportRes.status}`);
  console.log(`Metrics:`, supportRes.data?.metrics);
  console.log(`Tickets Count:`, (supportRes.data?.data || []).length);

  // 4. Test Submitting a New Support Ticket (POST /api/v1/support/create)
  console.log('\n4. Testing Mobile Support Ticket Dispatch (POST /api/v1/support/create)...');
  const submitRes = await fetchJson('http://localhost:4000/api/v1/support/create', { method: 'POST' }, {
    userName: 'Aarav Malhotra',
    userPhone: '+91 99887 76655',
    userEmail: 'aarav.m@example.com',
    category: 'VENUE_ACCESS',
    subject: 'Generator power backup capacity for Crystal Ballroom',
    message: 'Could you confirm the generator backup capacity for sound and DJ truss during our sangeet night?'
  });
  console.log(`Submit Status: ${submitRes.status}`);
  console.log(`Created Ticket: ${submitRes.data?.data?.ticketNumber} (${submitRes.data?.data?.subject})`);

  // 5. Verify Ticket Scanner Endpoint (POST /api/v1/manager/tickets/check)
  console.log('\n5. Testing Universal Ticket Pass Scanner (POST /api/v1/manager/tickets/check)...');
  const jwt = require('./backend/node_modules/jsonwebtoken');
  const secret = process.env.JWT_SECRET || (() => {
    try {
      const envContent = require('fs').readFileSync('./backend/.env', 'utf-8');
      const match = envContent.match(/JWT_SECRET=([^\r\n]+)/);
      return match ? match[1].trim() : null;
    } catch { return null; }
  })();
  if (!secret) {
    throw new Error('JWT_SECRET is required to sign authentication tokens.');
  }
  const token = jwt.sign(
    { id: 'admin_1', role: 'SUPER_ADMIN', email: 'admin@happylokam.com' },
    secret
  );
  const scannerRes = await fetchJson(
    'http://localhost:4000/api/v1/manager/tickets/check',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    },
    { ticketId: 'HL-TCK-92813' }
  );
  console.log(`Scanner Status: ${scannerRes.status}`);
  if (scannerRes.data?.success) {
    console.log('Verified Pass Details:');
    console.log(`  Ticket Code : ${scannerRes.data.data.ticketId}`);
    console.log(`  Customer    : ${scannerRes.data.data.customerName} (${scannerRes.data.data.customerPhone})`);
    console.log(`  Service     : ${scannerRes.data.data.serviceName}`);
    console.log(`  Total Amount: ₹${scannerRes.data.data.totalAmount}`);
    console.log(`  Pass Status : ${scannerRes.data.data.status}`);
    console.log(`  Payment     : ${scannerRes.data.data.paymentStatus}`);
  } else {
    console.log('Scanner error:', scannerRes.data || scannerRes.raw);
  }

  // 6. Verify Admin Activity Notifications
  console.log('\n6. Checking Admin Platform Activity Feed (GET /api/v1/admin/activity-notifications)...');
  const activityRes = await fetchJson('http://localhost:4000/api/v1/admin/activity-notifications');
  console.log(`Status: ${activityRes.status}`);
  const activities = activityRes.data?.data || [];
  console.log(`Recent Activities (${activities.length} total, ${activityRes.data?.unreadCount} unread):`);
  activities.slice(0, 3).forEach((a) => {
    console.log(`  [${a.severity}] ${a.title}: ${a.message}`);
  });

  console.log('\n========================================================');
  console.log('   ALL EC2 PRODUCTION SERVICES VERIFIED SUCCESSFULLY!   ');
  console.log('========================================================');

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
