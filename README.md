# Life Lessons Backend

## Overview
The **Life Lessons** backend provides a RESTful API for managing users, lessons, and subscriptions. It handles authentication, authorization, data persistence, and payment integration.

## Tech Stack
- **Node.js** (v20)
- **Express** – lightweight web framework
- **Prisma** – type‑safe ORM for PostgreSQL
- **Passport / JWT** – authentication with email/password and Google OAuth (Better Auth)
- **Stripe** – subscription and payment handling
- **dotenv** – environment configuration
- **Jest & Supertest** – unit & integration testing

## Key Features
- **User Management** – register, login, profile updates
- **Lesson CRUD** – create, read, update, delete lessons; public/private visibility
- **Favorites** – bookmark lessons for quick access
- **Subscription** – free vs premium tier enforcement via Stripe webhooks
- **Role‑Based Access Control** – admin, premium, and regular user permissions
- **Rate Limiting & Validation** – secure endpoints with `express-rate-limit` and `joi`

## Getting Started
1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```
2. **Configure environment** – copy `.env.example` to `.env` and fill in values:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `STRIPE_SECRET_KEY`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
3. **Database migration**
   ```bash
   npx prisma migrate dev --name init
   ```
4. **Run the server**
   ```bash
   npm run dev
   ```
   The API will be available at `http://localhost:4000/api`.

## Testing
```bash
npm test
```
Runs the Jest test suite with coverage reports.

## Deployment
- Build Docker image:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY . .
  RUN npm ci --omit=dev
  CMD ["node", "dist/index.js"]
  ```
- Push to your container registry and deploy to your cloud provider (e.g., Railway, Render, or Azure App Service).

## Contributing
1. Fork the repository
2. Create a feature branch
3. Submit a pull request with clear description and tests

## License
MIT © Life Lessons Team
