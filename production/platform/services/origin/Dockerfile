FROM quay.io/fedora/nodejs-20:latest

USER 0
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./server.js
COPY data ./data

EXPOSE 4000
CMD ["npm", "start"]
