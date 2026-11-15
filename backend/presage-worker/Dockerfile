# Cloud-hosted Presage worker (LiveKit subscribe + SmartSpectra).
# Needs a full glibc Node image — @livekit/rtc-node + SmartSpectra ship native runtimes.
FROM node:20-bookworm-slim

WORKDIR /app

# Soft Vulkan (lavapipe) helps SmartSpectra models that probe GPU on CPU-only hosts.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libvulkan1 \
    mesa-vulkan-drivers \
  && rm -rf /var/lib/apt/lists/*

ENV VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.x86_64.json
ENV LIBGL_ALWAYS_SOFTWARE=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8787
ENV SESSION_STORE_PATH=/tmp/vitalink-presage-sessions.json

EXPOSE 8787

CMD ["npm", "run", "start"]
