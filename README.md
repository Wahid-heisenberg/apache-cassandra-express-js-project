# Food Menu App

A simple food menu application with CRUD operations and search functionality, built with Node.js, Express, and Apache Cassandra.

## Features

- Create, Read, Update, Delete (CRUD) operations for food menu items
- Search functionality to find menu items by name, description, or category
- Interactive web GUI
- Docker support for easy deployment

## Technologies Used

- Backend: Node.js, Express.js
- Database: Apache Cassandra
- Frontend: HTML, CSS, JavaScript (vanilla)
- Containerization: Docker and Docker Compose

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Running the Application

1. Clone this repository
2. Navigate to the project directory
3. Start the application using Docker Compose:

```bash
docker-compose up -d
```

4. Access the application in your browser:

```
http://localhost:3000
```

## API Endpoints

The following API endpoints are available:

- `GET /api/menu-items` - Get all menu items
- `GET /api/menu-items/:id` - Get a specific menu item by ID
- `POST /api/menu-items` - Create a new menu item
- `PUT /api/menu-items/:id` - Update an existing menu item
- `DELETE /api/menu-items/:id` - Delete a menu item
- `GET /api/search?q=query` - Search menu items

## Data Model

The food menu items are stored in Cassandra with the following schema:

```
CREATE TABLE menu_items (
  id uuid PRIMARY KEY,
  name text,
  description text,
  category text,
  price decimal,
  is_vegetarian boolean,
  created_at timestamp,
  updated_at timestamp
);
```

## Development

To run the application in development mode:

1. Install Node.js dependencies:

```bash
npm install
```

2. Start the application with nodemon for auto-reload:

```bash
npm run dev
```

## Notes

- This application uses direct CQL queries instead of an ORM
- The search implementation is performed in-memory due to Cassandra's limitations with text search

# Apache Cassandra Documentation