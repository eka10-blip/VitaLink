# Cloud-hosted Presage worker (LiveKit subscribe + SmartSpectra).
# Needs a full glibc Node image — @livekit/rtc-node ships native bindings.
FROM node:20-bookworm-slim

WORKDIR /app

# Some native deps expect build tools at install time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
# Railway/Render inject PORT; default matches local.
ENV PORT=8787

EXPOSE 8787

CMD ["npm", "run", "start"]
