# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Prisma dvigatellari generate vaqtida yuklanadi (build uchun internet kerak)
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:24-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
# Kun chegaralari, ish vaqti, IVR jadvali va hisobot jadvallari mahalliy vaqtda hisoblanadi (Node ICU orqali)
ENV TZ=Asia/Tashkent
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
# Audio yozuvlar va IVR ovozli xabarlari ombori: volume birinchi ulanganda shu egalikni oladi
RUN mkdir -p /data/recordings /data/prompts && chown node:node /data/recordings /data/prompts
USER node
EXPOSE 3000
# Migratsiyalar har ishga tushishda qo'llanadi; seed host'dan ishga tushiriladi (README, "To'liq stek")
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
