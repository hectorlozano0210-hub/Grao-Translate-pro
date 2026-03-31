FROM node:20-bullseye-slim
WORKDIR /app

# Install Python and build tools required by native modules (node-gyp)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		python3 \
		python3-dev \
		build-essential \
		ca-certificates \
		libsqlite3-dev \
	&& rm -rf /var/lib/apt/lists/*

# Set development for build so devDependencies (tsx, typescript) are installed
ENV NODE_ENV=development

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Install tsx runner for TypeScript entrypoint
RUN npm i -g tsx

# Copy app sources
COPY . .

EXPOSE 3000

# Set NODE_ENV to production at runtime
ENV NODE_ENV=production

# Run the TypeScript server entry directly
CMD ["tsx", "server/server.ts"]
