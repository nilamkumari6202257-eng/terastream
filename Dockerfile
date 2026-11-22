# Works on any Docker host (VPS, Fly.io, Railway, Render, Coolify, Portainer...)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
# the server has zero runtime dependencies, so only dist/ + server/ are needed
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "server/index.mjs"]
