FROM node:lts-alpine

WORKDIR /app

ENV PORT 8000
EXPOSE ${PORT}

COPY . .
RUN npm ci

CMD ["npm", "start"]