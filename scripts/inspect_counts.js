const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function r() {
  try {
    const h = await p.heroSlide.count();
    const e = await p.upcomingEvent.count();
    const l = await p.lokSafariPackage.count();
    const v = await p.venue.count();
    const s = await p.partnerService.count();
    const o = await p.offer.count();
    const u = await p.user.count();
    console.log('DB_COUNTS:', JSON.stringify({heroSlides: h, events: e, loksafari: l, venues: v, services: s, offers: o, users: u}, null, 2));

    const eventsList = await p.upcomingEvent.findMany({ take: 5 });
    console.log('SAMPLE_EVENTS:', JSON.stringify(eventsList, null, 2));

    const venuesList = await p.venue.findMany({ take: 3 });
    console.log('SAMPLE_VENUES:', JSON.stringify(venuesList, null, 2));

    const heroList = await p.heroSlide.findMany({ take: 3 });
    console.log('SAMPLE_HERO:', JSON.stringify(heroList, null, 2));

    const safariList = await p.lokSafariPackage.findMany({ take: 3 });
    console.log('SAMPLE_SAFARI:', JSON.stringify(safariList, null, 2));
  } catch (err) {
    console.error('DB_ERROR:', err);
  } finally {
    await p.$disconnect();
  }
}
r();
