const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function seed() {
  const count = await prisma.lokSafariPackage.count();
  if (count === 0) {
    await prisma.lokSafariPackage.createMany({
      data: [
        {
          title: "Rajgir Glass Skywalk and Nalanda Ruins Safari",
          location: "Rajgir and Nalanda, Bihar",
          duration: "2 Days / 1 Night",
          price: 1999,
          description: "VIP access to Rajgir Glass Bridge Skywalk, Ropeway to Vishwa Shanti Stupa, and guided walk across UNESCO Nalanda University ruins. Includes luxury AC coach and royal resort stay.",
          imageUrl: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80",
          status: "Active"
        },
        {
          title: "Valmiki Tiger Reserve Jungle and Eco-Safari",
          location: "West Champaran, Bihar",
          duration: "3 Days / 2 Nights",
          price: 3499,
          description: "Open 4x4 Gypsy wildlife safari in Bihar tiger sanctuary, Gandak river boating, indigenous Tharu tribal cultural dance night, and campfire buffet under the stars.",
          imageUrl: "https://images.unsplash.com/photo-1534177616072-ef7dc120449d?auto=format&fit=crop&w=1200&q=80",
          status: "Active"
        },
        {
          title: "Bodh Gaya UNESCO Enlightenment Pilgrimage",
          location: "Gaya and Bodh Gaya, Bihar",
          duration: "1 Day Express",
          price: 1299,
          description: "VIP admission to Mahabodhi Temple under the sacred Bodhi Tree, Great Buddha 80ft statue, international monasteries, Falgu river evening aarti, and meditation session.",
          imageUrl: "https://images.unsplash.com/photo-1609137144822-26d953930419?auto=format&fit=crop&w=1200&q=80",
          status: "Active"
        },
        {
          title: "Kakolat Waterfall and Mandar Hill Trek",
          location: "Nawada and Banka, Bihar",
          duration: "1 Day Eco-Trek",
          price: 999,
          description: "Scenic trek up legendary Mandar Hill with modern ropeway, refreshing swim in Kakolat waterfalls, zip-line adventure, and authentic Bihari feast.",
          imageUrl: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1200&q=80",
          status: "Active"
        },
        {
          title: "Vikramshila Dolphin Sanctuary and Silk Trail",
          location: "Bhagalpur, Bihar",
          duration: "2 Days / 1 Night",
          price: 2199,
          description: "Sunrise boat expedition to spot rare Gangetic river dolphins, excavation site walk at ancient Vikramshila University, and traditional Tussar silk weaving studio visit.",
          imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
          status: "Active"
        }
      ]
    });
    console.log("✅ 5 LokSafari packages seeded successfully");
  } else {
    console.log("LokSafari packages already exist: " + count);
  }
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
