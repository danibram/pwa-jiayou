FROM node:12-alpine AS base

WORKDIR /src

COPY package*.json ./
RUN npm ci --no-audit

FROM base AS build

COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build
RUN npm prune --production --no-audit
RUN rm -rf .next/cache

FROM node:12-alpine

WORKDIR /usr/app

COPY --from=build /src/package.json /usr/app/package.json
COPY --from=build /src/node_modules /usr/app/node_modules
COPY --from=build /src/.next /usr/app/.next
COPY --from=build /src/public /usr/app/public

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm i next

ENV PORT 3002
EXPOSE $PORT
CMD npm start -- -p $PORT