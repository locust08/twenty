FROM postgres:16-alpine
RUN apk add --no-cache nodejs npm
WORKDIR /opt/sunyield-operations
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && chown -R postgres:postgres /opt/sunyield-operations
COPY --chown=postgres:postgres src/ ./src/
USER postgres
CMD ["node", "src/main.mjs"]
