# VYBORA

**Your World. Your People.** A responsive social-networking application with a React/Vite web client, Express API, SQLite database, and private, securely validated media uploads.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm. `better-sqlite3` is a native SQLite module; npm installs its prebuilt binary where available.

```powershell
cd D:\VYBORA
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The Vite development server proxies API requests to `http://127.0.0.1:3000`. Data is created under `data\vybora.sqlite`; uploaded files are stored under `uploads\`.

The production server serves the built web app and API from one origin:

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

Set `PORT` and `SESSION_DAYS` as appropriate. Production requires HTTPS: session cookies are Secure and use the `__Host-` prefix. Terminate TLS at a trusted reverse proxy and do not expose the HTTP listener directly to the internet. When exactly one trusted reverse proxy terminates TLS, set `TRUST_PROXY=1`; make sure it overwrites forwarded headers before enabling this setting. Back up the SQLite database and uploads together. `VYBORA_DB_PATH` and `VYBORA_UPLOADS_DIR` can select persistent storage locations; do not put either inside a public/static directory.

## Deploy on Render

The included `render.yaml` describes a single Node.js web service that builds and serves both the web app and API, with a persistent disk for the SQLite database and uploaded media. To deploy:

1. Push this project to a GitHub repository and connect that repository in Render.
2. Create a **Blueprint** from the repository and review the service and disk before confirming. The blueprint uses Render's `starter` service plan because persistent disks are required to keep user data and uploads across deploys; review current pricing before approving.
3. Wait for the `/healthz` health check to pass, then open the Render URL. Add a custom domain in Render if desired.

The Render service starts with a new, empty database; local accounts and uploads are not included. Keep this as one service instance while using SQLite and back up the mounted disk. The app is a small single-instance foundation, not a multi-region production social network.

Run the automated checks with `npm test` and create an optimized web build with `npm run build`.

## Working in this release

- Email/username registration and login with bcrypt-hashed passwords, random HTTP-only SameSite cookies, expiry, logout and logout-all.
- User profiles; profile editing, private-account controls, following and unfollowing.
- Profile-photo updates and persisted one-to-one messages.
- Persisted posts, paginated feed, public/follower/private post visibility, six reaction types, comments, bookmarks, post deletion, and people/post search.
- Photo and video posts with an 8 MB size limit, allowed-format checks, and file-signature verification.
- Stories stored on the server and automatically excluded after 24 hours.
- Notifications generated for follows, comments and reactions; current public-post hashtag trends.
- Light/dark display preferences, responsive desktop/mobile layouts, and mobile navigation.

## Deliberate limitations

This is the initial working foundation, **not** a production-ready global social network or a complete implementation of the requested platform. Phone/Google sign-in, email verification, password reset, two-factor authentication, real-time chat/calls, live video, reels/audio, friend requests, groups, pages, event/marketplace listings, admin/moderation workflows, payments/advertising, push notifications, rate-aware feed caching, and cloud media storage require further modules and, in several cases, trusted external providers and deployment secrets. They are not represented as working features here. Messaging is persisted one-to-one chat without real-time delivery. There are no sample users or fabricated feed/story items.

SQLite is suitable for local development and a small single-instance deployment, not multi-region production scale. Before a public launch, add a tested migration strategy; an external relational database and object storage; email/SMS/OAuth providers; operational logging, backups, monitoring and restore drills; comprehensive abuse/reporting and data-export/deletion workflows; security and accessibility reviews; and load, integration, and end-to-end tests. Configure and publish the platform's actual terms and privacy policy before inviting users.

## API outline

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/logout-all`
- `GET /api/feed?limit=12&cursor=<post-id>`, `POST /api/posts`, `DELETE /api/posts/:id`
- `PUT|DELETE /api/posts/:id/reaction`, `PUT|DELETE /api/posts/:id/bookmark`
- `GET|POST /api/posts/:id/comments`
- `GET /api/users/:username`, `GET /api/users/:username/posts`, `PATCH /api/profile`
- `GET /api/messages`, `GET /api/messages/:peerId`, `POST /api/messages/:peerId`
- `POST /api/users/:id/follow`, `DELETE /api/users/:id/follow`
- `GET /api/search?q=...`, `GET /api/suggestions`, `GET /api/trends`
- `POST /api/media`, `GET|POST /api/stories`, `GET /api/notifications`, `POST /api/notifications/read`
