# Overview

This is an inventory management dashboard application built with React and Express. The system allows users to track inventory items and outbound records through a modern web interface, with support for data import via CSV files and Google Sheets integration. The application features real-time data visualization, search and filtering capabilities, and a responsive design optimized for business analytics.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built using React with TypeScript and follows a component-based architecture:

- **UI Framework**: React with TypeScript for type safety
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Build Tool**: Vite for fast development and optimized production builds

The application uses a modular component structure with reusable UI components, custom hooks for mobile detection and toast notifications, and utility functions for styling and CSV parsing.

## Backend Architecture

The backend follows a RESTful API design pattern:

- **Server Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL (configured for Neon Database)
- **File Processing**: Multer for handling CSV file uploads
- **Session Management**: Connect-pg-simple for PostgreSQL-backed sessions

The server implements a storage abstraction layer with both in-memory and database implementations, allowing for flexible data persistence strategies.

## Data Storage Solutions

- **Primary Database**: PostgreSQL with three main tables:
  - `inventory_items`: Tracks product inventory with stock levels and status
  - `outbound_records`: Records product shipments and deliveries
  - `data_sources`: Manages external data source configurations
- **ORM**: Drizzle ORM provides type-safe database queries and schema validation
- **Migrations**: Database schema changes managed through Drizzle Kit

## Authentication and Authorization

The application uses session-based authentication with PostgreSQL session storage. Session configuration is handled through connect-pg-simple middleware.

## External Service Integrations

- **CSV Processing**: Custom CSV parser for importing inventory and outbound data
- **Google Sheets**: Integration for real-time data synchronization (configured but implementation pending)
- **Neon Database**: Cloud PostgreSQL hosting for production deployments
- **Font Awesome**: Icon library for UI components
- **Google Fonts**: Custom typography with Inter, DM Sans, and other font families

The application supports multiple data import methods and maintains audit trails for all data modifications through timestamp tracking.