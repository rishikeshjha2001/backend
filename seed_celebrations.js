const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding celebrations and venues...');

  // 1. Clean or upsert celebrations
  const events = [
    {
      title: 'Mega Navratri Dandiya & Garba Mahotsav 2026',
      category: 'Dandiya',
      date: new Date('2026-10-18T18:30:00Z'),
      location: 'Gandhi Maidan Mega Arena, Patna',
      description: 'Experience the electric beats of traditional Gujarati Garba, celebrity singer performances, vibrant ethnic dress competitions, and delicious Gujarati food stalls!',
      imageUrl: 'https://images.unsplash.com/photo-1604928141064-207cea6f571f?q=80&w=800&auto=format&fit=crop',
      price: 499,
      totalTickets: 1000,
      ticketsSold: 142,
      features: ['Live Gujarati Band', 'Dandiya Sticks Free', 'Food & Mocktail Stalls', 'Celebrity DJ Night', 'Premium Lounge'],
      status: 'Active'
    },
    {
      title: 'Royal Heritage Wedding & Vivah Experience',
      category: 'Wedding',
      date: new Date('2026-11-20T17:00:00Z'),
      location: 'Rajwada Palace & Royal Greens, Patna',
      description: 'Complete luxury wedding celebration package: Handcrafted floral mandap, grand royal barat procession, 7-course gourmet catering, and 4K drone cinematography.',
      imageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop',
      price: 75000,
      totalTickets: 20,
      ticketsSold: 5,
      features: ['Handcrafted Floral Mandap', 'Royal Barat & Dhol', '4K Cinematic Video', 'Complete Buffet Setup', 'Dedicated Event Concierge'],
      status: 'Active'
    },
    {
      title: 'Grand Birthday Carnival & Theme Milestone Bash',
      category: 'Birthday',
      date: new Date('2026-10-25T16:00:00Z'),
      location: 'Crystal Celebration Banquet, Kankarbagh, Patna',
      description: 'Transform birthdays into unforgettable fairy tales! Includes customized balloon arc, mascot appearance, 3D theme cake cutting, interactive magic show, and sound system.',
      imageUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?q=80&w=800&auto=format&fit=crop',
      price: 12999,
      totalTickets: 50,
      ticketsSold: 18,
      features: ['Theme Balloon Decoration', 'Interactive Magic Show', 'Custom 3D Cake', 'Kids Game Coordinator', 'Instant Photo Booth'],
      status: 'Active'
    },
    {
      title: 'Candlelight Luxury Anniversary & Rooftop Symphony',
      category: 'Anniversary',
      date: new Date('2026-11-05T19:00:00Z'),
      location: 'The Sky Deck Lounge & Gardens, Bailey Road, Patna',
      description: 'Private candlelit dinner under the stars with live acoustic violin, rose-petal walkway, customized keepsake gift, and 5-course chef curated dinner.',
      imageUrl: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=800&auto=format&fit=crop',
      price: 5999,
      totalTickets: 30,
      ticketsSold: 12,
      features: ['Private Cabana & Candles', 'Live Violinist / Guitarist', '5-Course Chef Dinner', 'Complimentary Champagne/Mocktail', 'Rose Petal Setup'],
      status: 'Active'
    },
    {
      title: 'Annual Corporate Gala, Tech Summit & Awards Night',
      category: 'Corporate',
      date: new Date('2026-12-10T10:00:00Z'),
      location: 'Hotel Maurya Grand Ball Room, South Gandhi Maidan, Patna',
      description: 'High-impact corporate gathering with 4K LED video walls, crystal clear JBL line array audio, conference kits, buffet lunch, and red-carpet award stage.',
      imageUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=800&auto=format&fit=crop',
      price: 24999,
      totalTickets: 25,
      ticketsSold: 8,
      features: ['LED Video Wall & Podium', 'JBL Sound & Wireless Mics', 'Full Day Catering', 'Live Streaming Setup', 'Stage & Backdrop Design'],
      status: 'Active'
    }
  ];

  for (const ev of events) {
    const existing = await prisma.upcomingEvent.findFirst({ where: { title: ev.title } });
    if (!existing) {
      await prisma.upcomingEvent.create({ data: ev });
      console.log(`Created event: ${ev.title}`);
    } else {
      console.log(`Event exists: ${ev.title}`);
    }
  }

  // 2. Ensure a partner exists for Venues
  let partner = await prisma.partner.findFirst();
  if (!partner) {
    partner = await prisma.partner.create({
      data: {
        hlpId: 'HLP-ROYAL-001',
        name: 'Royal Heritage Venues',
        email: 'royal@happylokam.com',
        passwordHash: 'dummy_hash_for_display',
        phone: '+91 98765 43210',
        businessName: 'Royal Heritage Luxury Venues & Lawns',
        categories: ['Wedding', 'Dandiya', 'Corporate'],
        location: 'Patna, Bihar',
        isVerified: true,
        status: 'VERIFIED',
        subscriptionStatus: 'ACTIVE'
      }
    });
    console.log('Created primary partner');
  }

  // 3. Seed Venues
  const venues = [
    {
      name: 'Rajwada Imperial Palace & Lawn',
      description: 'Massive 50,000 sq.ft lush green royal lawn with opulent banquet hall, AC bridal rooms, and parking for 300+ cars.',
      city: 'Patna',
      price: 85000,
      images: [
        'https://images.unsplash.com/photo-1519167758481-83f5244d23d7?q=80&w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?q=80&w=800&auto=format&fit=crop'
      ],
      status: 'Active',
      partnerId: partner.id
    },
    {
      name: 'The Orchid Grand Celebration Hall',
      description: 'Centrally air-conditioned grand banquet with Italian marble flooring, crystal chandeliers, and in-house sound.',
      city: 'Patna',
      price: 45000,
      images: [
        'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?q=80&w=800&auto=format&fit=crop'
      ],
      status: 'Active',
      partnerId: partner.id
    }
  ];

  for (const v of venues) {
    const existing = await prisma.venue.findFirst({ where: { name: v.name } });
    if (!existing) {
      await prisma.venue.create({ data: v });
      console.log(`Created venue: ${v.name}`);
    } else {
      console.log(`Venue exists: ${v.name}`);
    }
  }

  console.log('Seed completed successfully!');
  await prisma.$disconnect();
}

seed().catch(err => {
  console.error('Seed error:', err);
  prisma.$disconnect();
  process.exit(1);
});
