FROM us-west3-docker.pkg.dev/ptonboard-dev/onboarding-frontend/onboarding-frontend:champions-20261111-v1
COPY scripts/prospect-demo-release/review-nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
