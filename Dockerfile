FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Expose the port
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
