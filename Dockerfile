# Use the Playwright image so the matching Chromium browser and Linux dependencies are present.
FROM mcr.microsoft.com/playwright:v1.65.1-noble

WORKDIR /app

COPY package.json bun.lock ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# tsx runs the Express server; in production it serves the built Vite app and API from one origin.
CMD ["npx", "tsx", "server.ts"]
