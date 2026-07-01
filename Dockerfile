FROM node:24.18.0-alpine3.24 AS base
WORKDIR /app

FROM base AS dist
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
# RUN corepack enable
# RUN corepack prepare pnpm@10 --activate
RUN npm install -g pnpm@10 --registry=https://registry.npmmirror.com
COPY . /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=dist /app/dist /app/dist
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
