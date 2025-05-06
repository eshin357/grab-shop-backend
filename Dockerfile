# backend/Dockerfile
FROM node:20-slim

# 1) pull in Chromium and its deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      libappindicator3-1 \
      xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# 2) set workdir
WORKDIR /usr/src/app

# 3) copy and install your Node deps
COPY package.json package-lock.json ./
RUN npm ci --production

# 4) copy the rest of your backend code
COPY . .

# 5) expose the port Render will route to
ENV PORT 10000

# 6) tell Puppeteer where Chromium lives
ENV CHROME_PATH=/usr/bin/chromium

# 7) start your server
CMD ["npm", "start"]
