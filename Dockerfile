FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG VITE_CHAIN_ID=46630
ARG VITE_WALLETCONNECT_PROJECT_ID
ARG VITE_TESTNET_RPC_URL
ARG VITE_MAINNET_RPC_URL
ENV VITE_CHAIN_ID=$VITE_CHAIN_ID VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID VITE_TESTNET_RPC_URL=$VITE_TESTNET_RPC_URL VITE_MAINNET_RPC_URL=$VITE_MAINNET_RPC_URL
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm run contracts:compile
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/outpost.sqlite
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm","start"]
