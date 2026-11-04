const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('b:/happylokamcoding/backend/package.json', 'utf8'));
pkg.scripts = {
  start: "ts-node src/server.ts",
  dev: "nodemon src/server.ts",
  "db:push": "prisma db push",
  "db:generate": "prisma generate"
};
fs.writeFileSync('b:/happylokamcoding/backend/package.json', JSON.stringify(pkg, null, 2));
