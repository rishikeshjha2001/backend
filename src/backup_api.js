const fs = require('fs');
const path = require('path');

async function backupLiveProductionData() {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `production_api_backup_${timestamp}.json`);
  const latestFile = path.join(backupDir, `latest_backup.json`);

  console.log('Connecting to live production API at https://happylokam.com/api/v1...');

  const endpoints = [
    { key: 'events', url: 'https://happylokam.com/api/v1/events' },
    { key: 'listings', url: 'https://happylokam.com/api/v1/listings' },
    { key: 'loksafari', url: 'https://happylokam.com/api/v1/loksafari' },
    { key: 'offers', url: 'https://happylokam.com/api/v1/offers' },
    { key: 'blogs', url: 'https://happylokam.com/api/v1/blog' },
    { key: 'announcements', url: 'https://happylokam.com/api/v1/announcements' },
    { key: 'heroSlides', url: 'https://happylokam.com/api/v1/hero' },
    { key: 'subscriptionConfig', url: 'https://happylokam.com/api/v1/partners/subscription-config' },
  ];

  const backupData = {
    source: 'https://happylokam.com',
    timestamp: new Date().toISOString(),
    collections: {}
  };

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url);
      if (res.ok) {
        const json = await res.json();
        backupData.collections[ep.key] = json;
        console.log(`✅ Backed up ${ep.key} (${Array.isArray(json.data || json) ? (json.data || json).length : 'object'} items)`);
      } else {
        console.warn(`⚠️ Endpoint ${ep.key} returned ${res.status}`);
      }
    } catch (err) {
      console.warn(`❌ Error fetching ${ep.key}:`, err.message);
    }
  }

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
  fs.writeFileSync(latestFile, JSON.stringify(backupData, null, 2), 'utf8');

  console.log(`\n🎉 Complete Production Backup written to:\n${backupFile}\n${latestFile}`);
}

backupLiveProductionData();
