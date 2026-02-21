# PlotTwistCo People Operations Platform

A comprehensive People Operations training and enablement platform built with Vue.js, Node.js, Express, and MySQL. This platform supports multi-agency training management, role-based access, training tracks, and modern operational workflows.

## Features

- **User Authentication**: Secure login with JWT tokens
- **Training Modules**: Create and manage training modules with multiple content types
- **Content Types**:
  - Video content with custom video URLs
  - Slide presentations with HTML content
  - Interactive quizzes with multiple question types
- **Digital Signatures**: Canvas-based signature capture
- **Time Tracking**: Automatic time tracking for payroll
- **Progress Tracking**: Track user progress across all modules
- **Admin Interface**: Complete module and user management
- **Role-Based Access**: Support for Admin, Supervisor, Clinician, and other roles
- **Multi-Agency Support**: Manage multiple agencies and programs
- **Training Tracks**: Organize modules into logical tracks
- **Agency Branding**: Configurable branding per agency

## Tech Stack

### Frontend
- Vue.js 3 (Composition API)
- Vue Router
- Pinia (State Management)
- Axios (HTTP Client)
- Vite (Build Tool)

### Backend
- Node.js
- Express.js
- MySQL2
- JWT (Authentication)
- bcrypt (Password Hashing)
- Express Validator (Input Validation)

### Database
- MySQL 8.0 (Docker)

## Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- npm or yarn

## Setup Instructions

### 1. Clone the Repository

```bash
cd PTOnboardingApp
```

### 2. Start the Database

```bash
docker-compose up -d
```

This will start a MySQL container on port 3307 (to avoid conflicts with local MySQL). The database will be automatically initialized with the required tables.

### 3. Set Up Backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3307
DB_USER=onboarding_user
DB_PASSWORD=onboarding_pass
DB_NAME=onboarding_db

JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

CORS_ORIGIN=http://localhost:5173
```

### 4. Create Admin User

After the database is running, create the default admin user:

```bash
cd backend
node src/scripts/createAdmin.js
```

This will create an admin user with:
- Email: `admin@company.com`
- Password: `admin123`

### 5. Start Backend Server

```bash
cd backend
npm run dev
```

The backend API will be available at `http://localhost:3000`

**Note:** If you have a local MySQL instance running on port 3306, the Docker container will use port 3307 instead to avoid conflicts.

### 6. Set Up Frontend

Open a new terminal:

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` directory:

```env
VITE_API_URL=http://localhost:3000/api
```

### 7. Start Frontend Development Server

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Default Login Credentials

- **Admin Account**:
  - Email: `admin@company.com`
  - Password: `admin123`

## Project Structure

```
PTOnboardingApp/
├── backend/                 # Node.js/Express API
│   ├── src/
│   │   ├── config/          # Database and app configuration
│   │   ├── controllers/     # Request handlers
│   │   ├── middleware/      # Auth and validation middleware
│   │   ├── models/          # Database models
│   │   ├── routes/          # API routes
│   │   ├── scripts/         # Utility scripts
│   │   └── server.js        # Entry point
│   └── package.json
├── frontend/                # Vue.js application
│   ├── src/
│   │   ├── components/      # Vue components
│   │   ├── views/           # Page views
│   │   ├── router/          # Vue Router config
│   │   ├── services/        # API service layer
│   │   ├── store/           # Pinia stores
│   │   └── App.vue
│   └── package.json
├── database/
│   └── init.sql             # Database initialization
├── docker-compose.yml       # Docker configuration
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Register new user (admin only)

### Users
- `GET /api/users/me` - Get current user profile
- `GET /api/users` - List all users (admin only)
- `PUT /api/users/:id` - Update user

### Modules
- `GET /api/modules` - List all modules
- `GET /api/modules/:id` - Get module details
- `POST /api/modules` - Create module (admin)
- `PUT /api/modules/:id` - Update module (admin)
- `DELETE /api/modules/:id` - Delete module (admin)

### Content
- `GET /api/modules/:id/content` - Get module content
- `POST /api/modules/:id/content` - Add content to module (admin)
- `PUT /api/modules/:id/content/:contentId` - Update content (admin)
- `DELETE /api/modules/:id/content/:contentId` - Delete content (admin)

### Progress
- `GET /api/progress` - Get user progress
- `POST /api/progress/start` - Start a module
- `POST /api/progress/complete` - Complete a module
- `POST /api/progress/time` - Log time spent

### Quizzes
- `POST /api/quizzes/:moduleId/submit` - Submit quiz answers
- `GET /api/quizzes/:moduleId/attempts` - Get quiz attempts

### Signatures
- `POST /api/signatures` - Save signature
- `GET /api/signatures/:moduleId` - Get signature

## Usage Guide

### For Admins

1. **Login** with admin credentials
2. **Create Modules**: Go to Admin → Manage Modules
3. **Add Content**: Click "Content" button on a module to add videos, slides, or quizzes
4. **Manage Users**: Go to Admin → Manage Users to create and manage user accounts

### For Employees

1. **Login** with your credentials
2. **View Dashboard**: See all available training modules
3. **Complete Modules**: Click on a module to start training
4. **Track Progress**: View your completion status and time spent

## Content Types

### Video Content
- Provide a video URL (YouTube, Vimeo, or direct link)
- Optional title and description

### Slide Content
- Create multiple slides with HTML content
- Navigate between slides

### Quiz Content
- Multiple question types:
  - Multiple Choice
  - True/False
  - Text Answer
- Set minimum score requirements
- Allow retakes (configurable)

## Development

### Backend Development
```bash
cd backend
npm run dev  # Starts with auto-reload
```

### Frontend Development
```bash
cd frontend
npm run dev  # Starts Vite dev server
```

### Database Access
```bash
docker-compose exec mysql mysql -u onboarding_user -ponboarding_pass onboarding_db
```

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- SQL injection prevention (parameterized queries)
- Input validation with express-validator
- Rate limiting on authentication endpoints
- CORS configuration
- Role-based access control

## Documentation

- **`SMS_VOICE_BUILD_INSTRUCTIONS.md`** — SMS/voice setup, HIPAA, usage monitoring, Google transcription (continuation guide)
- **`TWILIO_SETUP.md`** — Twilio account, credentials, webhooks
- **`TWILIO_HIPAA_COMPLIANCE.md`** — HIPAA checklist for Twilio
- **`GOOGLE_TRANSCRIPTION_INTEGRATION.md`** — Speech-to-Text integration for voicemail/clinical notes

## Future Enhancements

- Google OAuth integration
- Google Cloud SQL migration
- File upload for custom content
- Email notifications
- PDF certificate generation
- Advanced analytics and reporting

## Troubleshooting

### Database Connection Issues
- Ensure Docker is running: `docker ps`
- Check database logs: `docker-compose logs mysql`
- Verify environment variables in `backend/.env`

### Port Conflicts
- Backend default port: 3000
- Frontend default port: 5173
- MySQL default port: 3307 (Docker container, mapped from internal 3306)
- Modify ports in configuration files if needed

### Admin User Creation
If the admin user creation script fails, you can create it manually via the API after logging in with another admin account, or directly in the database.

## License

This project is proprietary software for internal use.

## Support

For issues or questions, please contact the development team.

