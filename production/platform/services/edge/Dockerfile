FROM quay.io/fedora/nodejs-20:latest

USER 0
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src

EXPOSE 3001
CMD ["npm", "start"]
