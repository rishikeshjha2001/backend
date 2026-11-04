// Node script to clean DB and seed rich celebration sections on live server
const https = require('https');

async function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      timeout: 15000,
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, text: body });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function main() {
  console.log('1. Logging in as Admin...');
  const loginRes = await request('https://happylokam.com/api/v1/auth/login', {
    method: 'POST'
  }, {
    email: 'admin@happylokam.com',
    password: 'Rose600@happylokam'
  });

  if (!loginRes.data || !loginRes.data.token) {
    console.error('Admin login failed:', loginRes);
    process.exit(1);
  }

  const token = loginRes.data.token;
  console.log('✅ Admin logged in successfully!');

  // 2. Fetch existing sections
  console.log('2. Fetching current sections...');
  const secRes = await request('https://happylokam.com/api/v1/sections');
  const sections = secRes.data?.data || [];
  console.log(`Found ${sections.length} current sections.`);

  // Delete old sections (like Royal Heritage Retreats)
  for (const s of sections) {
    console.log(`Deleting old section [${s.id}] "${s.title}"...`);
    const delRes = await request(`https://happylokam.com/api/v1/sections/${s.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`Deleted section ${s.id}:`, delRes.data?.success ? 'OK' : delRes.data);
  }

  // 3. Create fresh, realistic celebration sections
  const newSections = [
    {
      title: 'Top Wedding Mandaps & Grand Banquets',
      subtitle: 'Luxury royal lawns, AC glass halls & poolside mandaps',
      tag: 'WEDDING SPECIALS',
      order: 1,
      isActive: true,
      items: [
        {
          title: 'Grand Rajwada Celebration Lawns',
          subtitle: 'Expansive 2-acre royal wedding lawn with grand entrance mandap',
          cornerTag: 'MOST POPULAR',
          location: 'Patna, Bihar',
          itemType: 'BOOKING',
          price: 85000,
          priceUnit: 'per event',
          image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
          features: [
            '2-Acre Natural Lawn & Grand Mandap',
            'Full Central AC Banquet with 800 Seating',
            'Complimentary Bride & Groom Luxury Suites',
            'Valet Parking for 200+ Cars & 100% Power Backup',
          ],
          availableDates: ['2026-11-15', '2026-11-20', '2026-12-05', '2026-12-12'],
          availableTimes: ['10:00 AM - 04:00 PM', '06:00 PM - 12:00 AM'],
          totalSlots: 10,
          rating: 4.9,
          tags: ['Wedding', 'Mandap', 'AC Banquet', 'Valet Parking'],
          capacity: 800,
        },
        {
          title: 'The Crystal Ballroom & Garden',
          subtitle: 'Stunning French crystal chandeliers & ambient cocktail lounge',
          cornerTag: 'LUXURY GLASS HALL',
          location: 'Hyderabad, Telangana',
          itemType: 'BOOKING',
          price: 125000,
          priceUnit: 'per event',
          image: 'https://images.unsplash.com/photo-1545232979-fbf68fe9b1af?auto=format&fit=crop&w=800&q=80',
          features: [
            'State-of-the-Art Line Array Sound & Stage',
            'Floating Glass Deck & Cocktail Terrace',
            'Dedicated Event Concierge & Security Staff',
            'In-house Buffet Stations & Live Mocktail Bar',
          ],
          availableDates: ['2026-11-18', '2026-11-25', '2026-12-08'],
          availableTimes: ['11:00 AM - 04:00 PM', '07:00 PM - 12:30 AM'],
          totalSlots: 8,
          rating: 4.95,
          tags: ['Glass Hall', 'Chandeliers', 'Cocktail Lounge'],
          capacity: 1200,
        },
        {
          title: 'Heritage Shahi Haveli Courtyard',
          subtitle: 'Authentic royal Rajasthani haveli with shehnai musicians',
          cornerTag: 'ROYAL HERITAGE',
          location: 'Jaipur, Rajasthan',
          itemType: 'BOOKING',
          price: 65000,
          priceUnit: 'per event',
          image: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
          features: [
            'Traditional Shehnai Welcome Artists',
            'Carved Stone Courtyard & Royal Arches',
            'Authentic Marwari & Awadhi Kitchen Setup',
            'Photogenic Jharokhas for Pre-Wedding Shoots',
          ],
          availableDates: ['2026-11-10', '2026-11-22', '2026-12-02'],
          availableTimes: ['09:00 AM - 03:00 PM', '05:30 PM - 11:30 PM'],
          totalSlots: 12,
          rating: 4.88,
          tags: ['Heritage', 'Haveli', 'Shehnai'],
          capacity: 500,
        },
      ],
    },
    {
      title: 'Magical Birthday Themes & Kids Bashes',
      subtitle: 'Complete 3D balloon sets, live cartoon mascots & puppet shows',
      tag: 'KIDS & BIRTHDAYS',
      order: 2,
      isActive: true,
      items: [
        {
          title: 'Royal Princess Castle 3D Theme',
          subtitle: '1000+ pastel balloons, giant pink castle cutout & LED neon lights',
          cornerTag: 'BESTSELLER',
          location: 'Patna, Bihar',
          itemType: 'BOOKING',
          price: 24999,
          priceUnit: 'all-inclusive package',
          image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
          features: [
            'Custom 3D Princess Castle Backdrop & Name LED',
            'Pastel Chrome Balloon Arch & Garland',
            'Live Tattoo Artist & Balloon Sculptor (2 Hours)',
            'Special Cake Table Decor with Cake Cutting Confetti Blast',
          ],
          availableDates: ['2026-10-28', '2026-11-02', '2026-11-08', '2026-11-14'],
          availableTimes: ['02:00 PM - 06:00 PM', '06:30 PM - 10:30 PM'],
          totalSlots: 20,
          rating: 4.9,
          tags: ['Birthday', 'Princess Castle', 'Pastel Decor'],
          capacity: 100,
        },
        {
          title: 'Avengers Superhero Action Adventure',
          subtitle: 'Life-sized superhero statues, neon comic panels & foam party',
          cornerTag: 'ACTION THEME',
          location: 'Bengaluru, Karnataka',
          itemType: 'BOOKING',
          price: 19999,
          priceUnit: 'all-inclusive package',
          image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80',
          features: [
            'Iron Man & Captain America Life-Size Cutouts',
            'Comic Explosion Balloon Garland & Fog Machine',
            'Interactive Game Host & Magic Show Artist',
            'Personalized Return Gift Bags for 25 Kids',
          ],
          availableDates: ['2026-10-30', '2026-11-05', '2026-11-12'],
          availableTimes: ['01:00 PM - 05:00 PM', '06:00 PM - 10:00 PM'],
          totalSlots: 15,
          rating: 4.85,
          tags: ['Avengers', 'Magic Show', 'Superhero'],
          capacity: 80,
        },
        {
          title: 'Jungle Safari Wild Explorer Theme',
          subtitle: '3D Giraffe & Lion cutouts, tropical foil vines & smoke effect',
          cornerTag: 'TROPICAL SAFARI',
          location: 'Mumbai, Maharashtra',
          itemType: 'BOOKING',
          price: 21500,
          priceUnit: 'all-inclusive package',
          image: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=800&q=80',
          features: [
            'Giant Jungle Canopy & Foliage Installation',
            'Live Mascot Costume Host (Mickey / Lion)',
            'Cotton Candy & Popcorn Machine Live Station',
            'Kids Seating Mats & Personalized Theme Cutlery',
          ],
          availableDates: ['2026-11-01', '2026-11-07', '2026-11-15'],
          availableTimes: ['03:00 PM - 07:00 PM', '07:00 PM - 11:00 PM'],
          totalSlots: 18,
          rating: 4.92,
          tags: ['Jungle Theme', 'Live Mascot', 'Popcorn Station'],
          capacity: 120,
        },
      ],
    },
    {
      title: 'Royal Catering Feasts & Live Food Stalls',
      subtitle: 'Pure Desi Ghee delicacies, Delhi chaat street & dessert bars',
      tag: 'CULINARY FEAST',
      order: 3,
      isActive: true,
      items: [
        {
          title: 'Shahi Awadhi & North Indian Grand Buffet',
          subtitle: '6 welcome drinks, 12 gourmet starters, live tandoor & 8 desserts',
          cornerTag: 'PURE DESI GHEE',
          location: 'Delhi NCR',
          itemType: 'BOOKING',
          price: 650,
          priceUnit: 'per plate',
          image: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
          features: [
            'Live Amritsari Kulcha & Dal Bukhara Counter',
            'Old Delhi Chandni Chowk Chaat Street',
            'Kadhai Jalebi with Rabri & Kesari Kheer',
            'Royal Silver Cutlery & Uniformed Butler Service',
          ],
          availableDates: ['2026-11-05', '2026-11-12', '2026-11-25', '2026-12-10'],
          availableTimes: ['12:00 PM - 04:00 PM', '07:30 PM - 11:30 PM'],
          totalSlots: 50,
          rating: 4.94,
          tags: ['Catering', 'Desi Ghee', 'Chaat', 'Dessert Bar'],
          capacity: 500,
        },
        {
          title: 'Traditional Dakshin Banana Leaf Banquet',
          subtitle: '24 authentic South Indian delicacies served on fresh banana leaf',
          cornerTag: 'AUTHENTIC DAKSHIN',
          location: 'Hyderabad, Telangana',
          itemType: 'BOOKING',
          price: 450,
          priceUnit: 'per banana leaf',
          image: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=80',
          features: [
            'Served on Fresh Organic Banana Leaves',
            'Hot Ghee Mysore Pak & Ada Pradhaman Payasam',
            'Live Filter Coffee Tumbler Counter',
            'Traditional Attire Service Staff',
          ],
          availableDates: ['2026-11-08', '2026-11-19', '2026-12-04'],
          availableTimes: ['11:30 AM - 03:30 PM', '07:00 PM - 10:30 PM'],
          totalSlots: 40,
          rating: 4.89,
          tags: ['Banana Leaf', 'South Indian', 'Filter Coffee'],
          capacity: 400,
        },
      ],
    },
    {
      title: 'Celebration Passes & Live Music Festivals',
      subtitle: 'Exclusive digital tickets for musical evenings & celebrations',
      tag: 'CONCERT PASSES',
      order: 4,
      isActive: true,
      items: [
        {
          title: 'Royal Sufi Night & Candlelight Banquet Pass',
          subtitle: 'Mesmerizing Sufi band live performance under fairy lit palace lawns',
          cornerTag: 'VIP ENTRY PASS',
          location: 'Patna, Bihar',
          itemType: 'TICKET',
          price: 1499,
          priceUnit: 'per pass',
          image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
          features: [
            'VIP Front-Row Seating by the Fountain',
            'Unlimited Gourmet Buffet & Mocktail Included',
            'Fast-Track Digital QR Gate Admission',
            'Free Valet Parking at the Venue',
          ],
          availableDates: ['2026-11-07', '2026-11-14', '2026-11-21'],
          availableTimes: ['07:00 PM - 11:30 PM'],
          totalSlots: 200,
          rating: 4.96,
          tags: ['Sufi Night', 'VIP Pass', 'Live Music'],
          capacity: 200,
        },
      ],
    },
  ];

  for (const s of newSections) {
    console.log(`\nCreating section: "${s.title}"...`);
    const createdSec = await request('https://happylokam.com/api/v1/sections', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }, {
      title: s.title,
      subtitle: s.subtitle,
      tag: s.tag,
      order: s.order,
      isActive: s.isActive
    });

    if (createdSec.data?.success && createdSec.data?.data?.id) {
      const secId = createdSec.data.data.id;
      console.log(`✅ Section created [${secId}]! Adding ${s.items.length} items...`);
      for (const it of s.items) {
        const createdItem = await request(`https://happylokam.com/api/v1/sections/${secId}/items`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }, it);
        console.log(`   + Added item: "${it.title}" (₹${it.price}) -> ${createdItem.data?.success ? 'OK' : 'ERR'}`);
      }
    } else {
      console.error('Failed to create section:', createdSec.data);
    }
  }

  console.log('\n🎉 ALL REAL CELEBRATION SECTIONS SEEDED SUCCESSFULLY!');
}

main().catch(console.error);
