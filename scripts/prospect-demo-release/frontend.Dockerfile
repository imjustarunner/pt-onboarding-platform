FROM us-west3-docker.pkg.dev/ptonboard-dev/onboarding-frontend/onboarding-frontend:5b13f52e8546d2d70529f5faa43030943d45bceb
COPY frontend/dist/ /usr/share/nginx/html/
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/dist/itsco-public.nginx.conf /etc/nginx/conf.d/itsco-public.conf
COPY frontend/dist/tenant-legal-locations.conf /etc/nginx/tenant-legal-locations.conf
RUN rm /usr/share/nginx/html/itsco-public.nginx.conf /usr/share/nginx/html/tenant-legal-locations.conf && nginx -t
