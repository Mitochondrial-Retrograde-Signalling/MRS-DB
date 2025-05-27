# Use Nginx base image
FROM nginx:alpine

# Copy the build folder to Nginx's HTML directory
COPY build/ /usr/share/nginx/html

# routing support for React Router
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
