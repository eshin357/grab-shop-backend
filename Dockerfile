# 1) base Node+Debian
FROM node:20-bullseye

# 2) install Chrome + deps
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libxkbcommon0 libxss1 libxcomposite1 libxcursor1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 \
    libpango-1.0-0 libgconf-2-4 libgtk-3-0 libdrm2 \
  && rm -rf /var/lib/apt/lists/* \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
       | apt-key add - \
  && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 3) install your code
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY backend.js ./

CMD ["node","backend.js"]
