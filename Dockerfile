# Use an official Node.js runtime as a base image
FROM node:20-slim

# install Chrome’s Debian repository and Puppeteer dependencies
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      wget \
      ca-certificates \
      fonts-liberation \
      libappindicator3-1 \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      xdg-utils \
      --no-install-recommends \
 && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
    | apt-key add - \
 && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

# set workdir
WORKDIR /usr/src/app

# copy package.json and lock
COPY package.json package-lock.json ./

# install dependencies
RUN npm ci --production

# copy rest of the code
COPY . .

# start your server
CMD ["npm", "start"]
