FROM node:lts-slim
WORKDIR /app
COPY . .
RUN npm ci
CMD ["npm", "start"]