# 🎫 TicketFlow – Jira-like Ticket Management System

A full-featured ticket management system with Docker containerization, wiki knowledge base, Discord integration, and more.

## Features

- **Ticket Management** – Create, edit, filter, and track tickets with Status, Priority, Assignee, Reporter, Labels, Tags, Epics, and Sprints
- **Wiki Knowledge Base** – Create and link wiki articles to tickets for documentation
- **File Attachments** – Upload photos (PNG, JPG, GIF, WEBP) and PDFs to tickets
- **Discord Notifications** – Get notified when tickets are created, updated, commented on, or closed
- **User Management** – Role-based access with admin and user roles
- **Epics & Sprints** – Organize work into epics and sprints
- **Dashboard** – Overview with statistics and recent activity

## Quick Start

### Prerequisites
- Docker & Docker Compose installed

### Launch

```bash
cd my_company_tickets
docker compose up --build -d
```

The app will be available at **http://localhost:3003**

### Default Login

| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | admin123  | Admin |
| jsmith   | tech123   | User  |
| agarcia  | tech123   | User  |
| bwong    | tech123   | User  |

## Architecture

```
┌──────────┐     ┌──────────┐     ┌───────────┐
│  nginx   │────▶│ backend  │────▶│ postgres  │
│  :3003   │     │  :4001   │     │  :5433    │
│ (proxy + │     │ (Express │     │ (PG 16)   │
│  static) │     │   API)   │     │           │
└──────────┘     └──────────┘     └───────────┘
```

- **nginx** – Serves frontend static files and reverse-proxies `/api/` to the backend
- **backend** – Node.js/Express REST API with JWT authentication
- **postgres** – PostgreSQL 16 database with auto-schema bootstrap and seed data

## Project Structure

```
my_company_tickets/
├── docker-compose.yml          # 3-service stack
├── nginx.conf                  # Reverse proxy config
├── README.md
├── frontend/                   # Static frontend (served by nginx)
│   ├── index.html
│   ├── styles.css
│   └── script.js
└── backend/                    # Node.js / Express API
    ├── Dockerfile
    ├── package.json
    ├── .env.example
    ├── .dockerignore
    └── src/
        ├── server.js
        ├── db.js               # PG pool + schema bootstrap
        ├── auth.js             # bcrypt + JWT helpers
        ├── seed.js             # Admin + sample data seeder
        ├── middleware/
        │   └── authMiddleware.js
        └── routes/
            ├── authRoutes.js
            ├── userRoutes.js
            ├── ticketRoutes.js
            ├── wikiRoutes.js
            ├── epicRoutes.js
            ├── sprintRoutes.js
            ├── settingsRoutes.js
            └── uploadRoutes.js
```

## API Endpoints

| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| POST   | `/api/auth/login`                 | Login                    |
| POST   | `/api/auth/register`              | Register                 |
| GET    | `/api/auth/me`                    | Current user profile     |
| GET    | `/api/tickets`                    | List tickets (filterable)|
| POST   | `/api/tickets`                    | Create ticket            |
| GET    | `/api/tickets/:id`                | Get ticket detail        |
| PUT    | `/api/tickets/:id`                | Update ticket            |
| DELETE | `/api/tickets/:id`                | Delete ticket            |
| POST   | `/api/tickets/:id/comments`       | Add comment              |
| POST   | `/api/tickets/:id/wiki-link`      | Link wiki to ticket      |
| GET    | `/api/wiki`                       | List wiki articles       |
| POST   | `/api/wiki`                       | Create article           |
| GET    | `/api/wiki/:id`                   | Get article detail       |
| PUT    | `/api/wiki/:id`                   | Update article           |
| DELETE | `/api/wiki/:id`                   | Delete article           |
| GET    | `/api/epics`                      | List epics               |
| POST   | `/api/epics`                      | Create epic              |
| GET    | `/api/sprints`                    | List sprints             |
| POST   | `/api/sprints`                    | Create sprint            |
| GET    | `/api/users`                      | List users               |
| POST   | `/api/users`                      | Create user (admin)      |
| POST   | `/api/upload/:ticketId`           | Upload attachment        |
| GET    | `/api/settings`                   | Get settings (admin)     |
| PUT    | `/api/settings/:key`              | Update setting (admin)   |
| POST   | `/api/settings/test-discord`      | Test Discord webhook     |

## Discord Integration

1. Go to **Settings** page (admin only)
2. Create a Discord webhook in your server channel settings
3. Paste the webhook URL and click **Save**
4. Click **Test Notification** to verify
5. Notifications will be sent automatically for ticket events

## Stopping

```bash
docker compose down        # Stop containers
docker compose down -v     # Stop and remove volumes (data reset)
```
