# Stage 1: Build everything
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
RUN npm ci
COPY . .
RUN npm run build --workspace=client
RUN npm run build --workspace=server

# Stage 2: Production server
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
RUN npm ci --workspace=server --workspace=shared --omit=dev
COPY --from=build /app/server/dist/ ./server/dist/
COPY shared/ ./shared/
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server/dist/server/src/index.js"]
