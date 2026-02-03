FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the backend (Transpile TypeScript to JavaScript)
# We override some tsconfig settings to ensure proper CommonJS output for Node
RUN npx tsc --outDir dist/backend --module CommonJS --target ES2020 --moduleResolution node --esModuleInterop true --skipLibCheck true src/backend/index.ts

# Build the frontend using Vite
# We output to dist/frontend/dist to match the path expected in src/backend/index.ts
RUN npx vite build --outDir dist/frontend/dist

# Remove development dependencies
RUN npm prune --production

# Create directory for configuration persistence
RUN mkdir -p config

# Expose the port the app runs on
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["node", "dist/backend/index.js"]
