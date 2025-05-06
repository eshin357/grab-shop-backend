# ───────────────────────────────────────────────────────────────
# 1) Base image with Node.js
FROM node:20-buster

# 2) Install Chrome
RUN apt-get update \
 && apt-get install -y wget gnupg ca-certificates \
 && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
 && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update \
 && apt-get install -y google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

# 3) Create app directory
WORKDIR /usr/src/app

# 4) Copy package files and install deps
COPY package*.json ./
RUN npm install --production

# 5) Copy your source in
COPY . .

# 6) Ensure production mode
ENV NODE_ENV=production

# 7) Expose port (your app listens on $PORT or 3000)
ENV PORT=3000
EXPOSE 3000

# 8) Start your server
CMD ["node", "backend.js"]
