# backend/Dockerfile

FROM node:20-bullseye

# 1) install system deps for Chrome
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxshmfence1 \
    libxkbcommon0 libsecret-1-0 libgtk-3-0 --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

# 2) install Google Chrome
RUN wget -qO- https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
 && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update \
 && apt-get install -y google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 3) copy & install your node code
COPY package*.json ./
RUN npm install
COPY . .

# 4) Render’s default port is 10000 (but we also fall back to PORT env)
ENV PORT=10000
EXPOSE 10000

CMD ["npm","start"]
