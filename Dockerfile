FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx prisma@5.22.0 generate
COPY . .
RUN npx prisma@5.22.0 generate
EXPOSE 3000
CMD ["node", "server.js"]
