FROM us-west3-docker.pkg.dev/ptonboard-dev/onboarding-backend/onboarding-backend:5b13f52e8546d2d70529f5faa43030943d45bceb
WORKDIR /app
COPY backend/src/controllers/directoryPublicLinks.controller.js /app/src/controllers/directoryPublicLinks.controller.js
COPY backend/src/controllers/user.controller.js /app/src/controllers/user.controller.js
COPY backend/src/middleware/auricwellPreview.middleware.js /app/src/middleware/auricwellPreview.middleware.js
COPY backend/src/models/User.model.js /app/src/models/User.model.js
COPY backend/src/routes/auricwellPreview.routes.js /app/src/routes/auricwellPreview.routes.js
COPY backend/src/routes/prospectDemo.routes.js /app/src/routes/prospectDemo.routes.js
COPY backend/src/scripts/provisionProspectDemo.mjs /app/src/scripts/provisionProspectDemo.mjs
COPY backend/src/server.js /app/src/server.js
COPY backend/src/services/auricwellAgenda.service.js /app/src/services/auricwellAgenda.service.js
COPY backend/src/services/auricwellPreviewPolicy.js /app/src/services/auricwellPreviewPolicy.js
COPY backend/src/services/passwordRecovery.service.js /app/src/services/passwordRecovery.service.js
COPY backend/src/services/prospectDemo.service.js /app/src/services/prospectDemo.service.js
COPY backend/src/utils/accessControl.js /app/src/utils/accessControl.js
COPY database/migrations/1790_prospect_demo_instances.sql /app/database/migrations/1790_prospect_demo_instances.sql
COPY frontend/dist/ /app/public/
