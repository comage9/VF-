# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VF Analytics Dashboard - A hybrid Django + React + Node.js application for visualizing and analyzing sales and inventory data. Originally pure Node.js, refactored to Django backend for performance with 200K+ records.

**Architecture:**
```
Browser → Node.js (5174) → Django API (5176) → SQLite DB
         ↳ Static Files    ↳ Data Processing
```

**Key Design Principle:** Django is the single source of truth for all data. Node.js only serves static files and proxies `/api/*` requests to Django.

## Development Commands

### Backend (Django)
```bash
cd backend
source .venv/bin/activate  # or: .venv\Scripts\activate (Windows)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:5176
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev              # Port 5174, proxies /api/* to Django
npm run build            # Production build
npm run lint             # ESLint
```

### Alternative: Use scripts
```bash
./start_backend.sh       # Backend startup
frontend/start_frontend.sh  # Frontend startup
```

### Django Management Commands
```bash
python manage.py import_legacy_db  # Migrate legacy data to Django DB
```

## Architecture Details

### Port Configuration
- **5174** - External access (Node.js server - single entry point)
- **5176** - Internal Django backend (not exposed externally)
- For external network access: `SERVER_HOST=0.0.0.0 PORT=5174 npm run dev`

### Environment Variables
- `DJANGO_BASE_URL` - Django backend URL (default: `http://localhost:5176`)
- `SERVER_HOST` - Server host for external access
- `PORT` - Server port (default: 5174)
- `OUTBOUND_GOOGLE_SHEET_URL` - Google Sheets CSV export URL (optional)
- `GOOGLE_SHEETS_API_KEY` - For `/api/google-sheets/connect` (optional)

### Key Components

**Backend (`backend/sales_api/`):**
- `models.py` - Django models (OutboundRecord, InventoryItem, BarcodeMaster, ProductionLog, etc.)
- `views.py` - API views with server-side aggregation for performance
- `urls.py` - API endpoints
- `serializers.py` - DRF serializers

**Frontend (`frontend/client/`):**
- `src/components/outbound-dashboard-unified.tsx` - Main dashboard component
- `src/components/outbound-tab.tsx` - Sales data visualization
- `src/components/inventory-tab.tsx` - Inventory management UI
- React Query for data fetching
- Recharts for visualization

**Proxy (`frontend/server/`):**
- `routes.ts` - API routing, proxies all `/api/*` to Django
- `index.ts` - Node.js server entry point

## Key API Endpoints (Django)

- `GET /api/outbound` - Outbound records with filtering
- `GET /api/outbound/stats` - Aggregated sales statistics (groupBy: day/week/month)
- `GET /api/outbound/top-products` - Top-selling products
- `GET /api/inventory/unified` - Unified inventory with calculated thresholds
- `GET /api/production` - Production logs
- `GET /api/ai/predict-hourly` - AI predictions
- `POST /api/outbound/sync` - Sync data from external sources

## Important Constraints

1. **No Direct DB Access in Node:** Node.js must NOT read from SQLite or JSON files directly. All data access goes through Django API.

2. **Server-Side Aggregation:** Complex calculations (daily/weekly/monthly grouping) are done in Django views, not frontend.

3. **Date Validation:** Always use `isValid()` checks before passing dates to date functions to prevent `RangeError: Invalid time value`.

4. **Route Duplication:** Check `frontend/server/routes.ts` for duplicate route definitions which cause silent failures.

5. **Performance for Large Datasets:**
   - Chart downsampling for 60+ days of data
   - Hide `CompactPivotTable` component for large date ranges
   - Server-side aggregation via `/api/outbound/stats`

## Known Issues Fixed

- `RangeError: Invalid time value` - Resolved with `isValid()` date validation in `OutboundDashboardUnified.tsx`
- Performance issues with 200K+ records - Resolved with Django backend and server-side aggregation

## Security Notes

- `.env` file contains sensitive tokens and is excluded from git
- `sample/` and `legacy/` directories are excluded from git
- Django DEBUG=True for development only
- CORS enabled for cross-origin requests (review for production)

## Git Workflow

This repository uses GitHub with HTTPS authentication:
```bash
git pull                    # Get latest changes from other AIs/users
git add .
git commit -m "message"
git push
```

GitHub token is stored in `.env` as `gittoken`.

## File Locations

```
Project Root
├── backend/
│   ├── sales_api/          # Django app (models, views, serializers)
│   ├── config/             # Django settings
│   ├── manage.py           # Django management
│   └── db.sqlite3          # SQLite database (excluded from git)
├── frontend/
│   ├── client/             # React app
│   │   ├── src/            # React components
│   │   └── package.json    # Frontend dependencies
│   ├── server/             # Node.js proxy (routes.ts, index.ts)
│   └── package.json        # Root dependencies
├── .env                    # Environment variables (excluded from git)
├── README.md               # Main documentation
├── PROJECT_DESCRIPTION.md  # Detailed project info
└── RENEWAL_REFACTOR_CHECKLIST.md  # Refactoring checklist
```
