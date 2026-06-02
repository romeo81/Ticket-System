FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install dependencies first for better layer caching. Use `npm ci` when a
# lockfile is present (reproducible), otherwise fall back to `npm install`.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 4001

# Container-level healthcheck (mirrors the docker-compose healthcheck) so the
# image is also usable standalone. Uses node (no extra packages required).
HEALTHCHECK --interval=5s --timeout=3s --retries=12 --start-period=20s \
  CMD node -e "require('http').get('http://127.0.0.1:4001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
