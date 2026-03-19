FROM node:18-alpine
WORKDIR /app

ENV NODE_ENV=production

# Install dependencies (including dev so TypeScript runtime works)
COPY package*.json ./
RUN npm ci

# Install tsx runner for TypeScript entrypoint
RUN npm i -g tsx

# Copy app sources
COPY . .

EXPOSE 3000

# Run the TypeScript server entry directly (suitable for testing on Render/Railway)
CMD ["tsx", "server/server.ts"]
