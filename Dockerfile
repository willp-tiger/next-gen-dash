# Stage 1: Build client
FROM node:22-alpine AS client-build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
RUN npm ci
COPY . .
RUN npm run build --workspace=client

# Stage 2: Production server
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
RUN npm ci --workspace=server --workspace=shared --omit=dev
COPY server/ ./server/
COPY shared/ ./shared/
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npx", "tsx", "server/src/index.ts"]
