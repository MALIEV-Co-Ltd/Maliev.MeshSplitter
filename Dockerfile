FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
ENV VITE_MESH_API_BASE_URL=/tools/mesh-splitter/api
ENV VITE_CREDITS_ENFORCEMENT=required
ENV VITE_SHOPIFY_STORE_DOMAIN=shop.maliev.com
ENV VITE_ASSET_BASE=/tools/mesh-splitter/
RUN npm run build

FROM node:22-bookworm-slim AS backend
WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
ENV FRONTEND_DIST_DIR=/app/frontend/dist
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "--prefix", "backend", "start"]
