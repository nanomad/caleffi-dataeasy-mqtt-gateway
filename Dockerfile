# Stage 1: Build
FROM node:24-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Compile TypeScript
RUN npm run build

# Stage 2: Run
FROM node:24-alpine

# Set the working directory
WORKDIR /app

RUN mkdir "config"

# Copy only the necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

VOLUME ["config"]

# Set the default command (modify if necessary)
CMD ["node", "dist/index.js"]