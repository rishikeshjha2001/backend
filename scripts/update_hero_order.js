const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateHeroSlides() {
  console.log('--- REORDERING HERO SLIDES ---');
  // Order:
  // 1: Photo 3 (Grand Royal Birthday)
  // 2: Photo 4 (Wedding Rings / Destination Palaces)
  // 3: Photo 2 (Corporate Galas)
  // 4: Photo 1 (Vedic Vivah)

  const slidesData = [
    {
      title1: 'Grand Royal',
      title2: 'Birthday Festivities.',
      badge: 'Milestone Celebrations',
      desc: 'Custom Royal Throne Themes, Organic Balloon Arches & Immersive Celebration Lighting.',
      image: '/images/hero/hero_birthday_throne.jpg',
      ctaText: 'Reserve Setup',
      ctaLink: '/explore?category=birthdays',
      gradient: 'from-amber-500 to-orange-600',
      order: 1,
      isActive: true,
    },
    {
      title1: 'Intimate Rings Ceremony &',
      title2: 'Cocktail Evenings.',
      badge: 'Engagement & Sangeet',
      desc: 'Enchanting Floral Decor, Gourmet Live Catering & Soulful Musical Nights.',
      image: '/images/hero/hero_wedding_rings.jpg',
      ctaText: 'View Packages',
      ctaLink: '/explore?category=engagements',
      gradient: 'from-rose-500 to-pink-700',
      order: 2,
      isActive: true,
    },
    {
      title1: 'Corporate Galas &',
      title2: 'Leadership Summits.',
      badge: 'Executive & Annual Meets',
      desc: 'State-of-the-Art AV, Luxury Banqueting, Keynote Theatres & Executive Suites.',
      image: '/images/hero/hero_corporate_events.jpg',
      ctaText: 'Book Corporate',
      ctaLink: '/explore?category=corporate',
      gradient: 'from-blue-600 to-indigo-800',
      order: 3,
      isActive: true,
    },
    {
      title1: 'Royal Vedic',
      title2: 'Vivah & Mandap.',
      badge: 'Traditional & Sacred Celebrations',
      desc: 'Curated Sacred Rituals, Grand Destination Banquets & Royal Mandap Designs.',
      image: '/images/hero/hero_vedic_vivah.jpg',
      ctaText: 'Explore Weddings',
      ctaLink: '/explore?category=weddings',
      gradient: 'from-amber-600 to-rose-700',
      order: 4,
      isActive: true,
    },
  ];

  // Clear existing slides and re-insert in exact desired order
  await prisma.heroSlide.deleteMany({});
  for (const s of slidesData) {
    const created = await prisma.heroSlide.create({ data: s });
    console.log(`Created slide [order ${created.order}]: ${created.title1} (${created.image})`);
  }

  const all = await prisma.heroSlide.findMany({ orderBy: { order: 'asc' } });
  console.log('FINAL HERO SLIDES IN DB:');
  all.forEach((s) => console.log(`  [Order ${s.order}] ${s.title1} | ${s.image}`));
}

updateHeroSlides()
  .catch((e) => {
    console.error('Hero update error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
