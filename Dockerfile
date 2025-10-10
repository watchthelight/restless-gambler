FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
RUN npm ci || npm i

COPY tsconfig.json jest.config.js .eslintrc.cjs .prettierrc ./
COPY src ./src
COPY tests ./tests

RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "run", "start"]

