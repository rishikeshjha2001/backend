# HappyLokam Backend

Production Node.js / Express / TypeScript backend for HappyLokam platform.

## Architecture & Tech Stack
- **Runtime**: Node.js & Express
- **Language**: TypeScript
- **Database**: PostgreSQL (Prisma ORM)
- **Cache & Sessions**: Redis
- **Payments**: Razorpay Live Gateway (Webhooks & Order Verification)
- **Authentication**: JWT & HttpOnly Secure Cookies

## Getting Started

1. Copy `.env.example` to `.env` and fill in credentials:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Generate Prisma client & apply database migrations:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   npm run start
   ```

