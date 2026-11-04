FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
RUN apt-get update && apt-get install -y --no-install-recommends python3 libseccomp2 poppler-utils && rm -rf /var/lib/apt/lists/*
ENV MALLOC_ARENA_MAX=2
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p .transcription-tmp && chown node:node .transcription-tmp
USER node
CMD ["npm", "start"]
