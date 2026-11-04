FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 libseccomp2 && rm -rf /var/lib/apt/lists/*
ENV MALLOC_ARENA_MAX=2
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p .transcription-tmp && chown node:node .transcription-tmp
USER node
CMD ["npm", "start"]
