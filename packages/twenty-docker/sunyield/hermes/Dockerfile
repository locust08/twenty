FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
RUN apk add --no-cache curl su-exec
WORKDIR /opt/sunyield-hermes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY upstream.json upstream.tar.gz ./
COPY scripts/ ./scripts/
RUN node scripts/fetch-upstream.mjs /opt/bridge && cd /opt/bridge && npm ci --omit=dev --ignore-scripts
RUN node scripts/patch-bridge.mjs /opt/bridge/bridge.js
COPY src/ ./src/
COPY UPSTREAM-LICENSE ./UPSTREAM-LICENSE
COPY entrypoint.sh ./
RUN chmod 755 entrypoint.sh
ENV DATA_DIRECTORY=/opt/data BRIDGE_DIRECTORY=/opt/bridge NODE_ENV=production
ENTRYPOINT ["/opt/sunyield-hermes/entrypoint.sh"]
CMD ["node", "src/main.mjs"]
