# π 工坊服务端镜像。构建上下文是仓库根目录（需要 book-v2/ 里的书稿）。
FROM node:22-bookworm-slim AS deps
WORKDIR /app/playground
COPY playground/package.json playground/package-lock.json ./
# 不执行任何依赖的安装脚本。
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    HOME=/tmp \
    PI_OFFLINE=1 \
    PI_TELEMETRY=0
WORKDIR /app
COPY --from=deps /app/playground/node_modules playground/node_modules
COPY playground/package.json playground/package.json
COPY playground/server playground/server
COPY playground/web playground/web
COPY book-v2 book-v2
USER node
EXPOSE 8787
CMD ["node", "playground/server/index.mjs"]
