# Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ARG VITE_API_BASE_URL
ARG VITE_AUTH_BASE_URL
ENV VITE_API_BASE_URL="/api/v1"
ENV VITE_AUTH_BASE_URL="/api/auth"

RUN npm run build


# Production Stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
