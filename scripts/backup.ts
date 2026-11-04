import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

// Configuration
const CONTAINER_NAME = 'happylokam-db'; // From docker-compose
const DB_USER = 'postgres';
const DB_NAME = 'happylokam';
const BACKUP_DIR = path.join(__dirname, '../../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(BACKUP_DIR, `happylokam-backup-${timestamp}.sql`);

console.log(`Starting database backup for ${DB_NAME}...`);

// Use docker exec to run pg_dump inside the container
const dumpCommand = `docker exec ${CONTAINER_NAME} pg_dump -U ${DB_USER} -d ${DB_NAME} -F c -f /tmp/backup.dump`;
const copyCommand = `docker cp ${CONTAINER_NAME}:/tmp/backup.dump ${backupFile}`;
const cleanupCommand = `docker exec ${CONTAINER_NAME} rm /tmp/backup.dump`;

exec(dumpCommand, (error, stdout, stderr) => {
  if (error) {
    console.error('Error creating database dump inside container:', error);
    return;
  }
  
  console.log('Dump created inside container. Copying to host...');
  exec(copyCommand, (copyErr) => {
    if (copyErr) {
      console.error('Error copying backup to host:', copyErr);
      return;
    }
    
    console.log(`✅ Backup successfully saved to: ${backupFile}`);
    
    // Cleanup container tmp file
    exec(cleanupCommand, () => {
      console.log('Temporary files cleaned up.');
    });
  });
});
