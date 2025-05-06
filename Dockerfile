# backend/Dockerfile
FROM node:18-slim

# install the dependencies Chrome needs
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates --no-install-recommends \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
     | apt-key add - \
  && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
     > /etc/apt/sources.list.d/google.list \
  && apt-get update && apt-get install -y \
     google-chrome-stable --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy package files & install
COPY package*.json ./
RUN npm ci

# copy the rest of your code
COPY . .

# expose the port Render will bind
ENV PORT 10000
EXPOSE 10000

# start in production mode
CMD ["npm", "start"]
