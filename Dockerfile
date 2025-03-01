FROM ubuntu:22.04

ENV NVM_DIR=/root/.nvm
RUN apt update && apt install -y curl && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install 22.14.0 \
    && nvm use 22.14.0 \
    && nvm alias default 22.14.0

ENV PATH="$NVM_DIR/versions/node/v22.14.0/bin:$PATH"

RUN apt-get clean && apt update && apt install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN . "$NVM_DIR/nvm.sh" nvm use v22.14.0
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

COPY src ./src
COPY env.yaml .

RUN npm run build

CMD ["sh", "-c", "node dist/main.js"]
