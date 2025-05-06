# backend/Dockerfile

# 1) Start from a Linux Node image
FROM node:20-buster

# 2) Install Chrome
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      wget gnupg ca-certificates \
 && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
      | apt-key add - \
 && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

# 3) Set working dir & copy only package.json first (for cache)
WORKDIR /app
COPY package.json package-lock.json ./

# 4) Install deps
RUN npm ci

# 5) Copy the rest of your code
COPY . .

# 6) Tell Puppeteer where Chrome lives
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
# 7) Make sure we’re in “production” so your HEADLESS flag flips on
ENV NODE_ENV=production

# 8) Start your app
CMD ["npm", "start"]
