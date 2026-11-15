#!/bin/zsh
cd /Users/leelasowjanya/Desktop/VitaLink/backend/presage-worker || exit 1
export PATH="/Users/leelasowjanya/.nvm/versions/node/v22.23.5/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/leelasowjanya"
while true; do
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] starting presage-worker"
  /Users/leelasowjanya/.nvm/versions/node/v22.23.5/bin/node ./node_modules/.bin/tsx src/index.ts
  code=$?
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] worker exited code=$code — restarting in 2s"
  sleep 2
done
