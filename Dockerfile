# backend/Dockerfile

# 1) start from official Node + Debian base
FROM node:20-buster

# 2) install Chrome stable
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

# 3) set your workdir
WORKDIR /app

# 4) copy package manifests first (for caching)
COPY package.json package-lock.json ./

# 5) install node modules
RUN npm ci

# 6) copy the rest of your source
COPY . .

# 7) tell Puppeteer where Chrome is
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
#    run in prod so HEADLESS=true
ENV NODE_ENV=production

# 8) expose the default Render port
#    Render uses PORT env var (defaults to 10000)
ENV PORT $PORT

# 9) start your app
CMD ["npm", "start"]
