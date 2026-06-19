FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Vite runs on dev mode binding to host machine
CMD ["npm", "run", "dev"]
