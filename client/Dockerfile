# Step 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY client/package*.json ./client/

# Install workspace dependencies
RUN npm ci --workspace=client

# Copy client source
COPY client ./client

# Build client
WORKDIR /app/client
RUN npm run build

# Step 2: Production Nginx runner
FROM nginx:1.27-alpine
COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
