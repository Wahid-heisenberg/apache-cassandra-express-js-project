const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cassandra = require('cassandra-driver');
const path = require('path');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Global connection state
let isDbConnected = false;
let dbInitialized = false;

// Cassandra client setup with adjusted options
const client = new cassandra.Client({
  contactPoints: [process.env.CASSANDRA_HOST || 'localhost'],
  localDataCenter: process.env.CASSANDRA_DC || 'datacenter1',
  // Don't specify keyspace here - we'll connect to it after ensuring it exists
  protocolOptions: {
    port: 9042
  },
  socketOptions: {
    connectTimeout: 30000, // 30 seconds
    readTimeout: 30000     // 30 seconds
  },
  queryOptions: {
    consistency: cassandra.types.consistencies.one,
    fetchSize: 1000,
    prepare: true,
    retryPolicy: new cassandra.policies.retry.RetryPolicy()
  },
  pooling: {
    coreConnectionsPerHost: {
      [cassandra.types.distance.local]: 2,
      [cassandra.types.distance.remote]: 1
    }
  }
});

// Handle database connection and initialization
async function connectToDatabase() {
  try {
    console.log('Attempting to connect to Cassandra...');
    await client.connect();
    console.log('Connected to Cassandra');

    // Create keyspace if it doesn't exist (this doesn't require being connected to a specific keyspace)
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS food_menu 
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    `);
    
    console.log('Keyspace created/verified');
    
    // Now connect to the keyspace
    await client.execute('USE food_menu');
    console.log('Using food_menu keyspace');

    // Create menu_items table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id uuid PRIMARY KEY,
        name text,
        description text,
        category text,
        price decimal,
        is_vegetarian boolean,
        created_at timestamp,
        updated_at timestamp
      )
    `);

    console.log('Database schema initialized successfully');
    
    // Test query to ensure everything works
    const test = await client.execute('SELECT * FROM menu_items LIMIT 1');
    console.log('Test query executed successfully');
    
    isDbConnected = true;
    dbInitialized = true;
    return true;
  } catch (err) {
    console.error('Error connecting to Cassandra:', err);
    isDbConnected = false;
    dbInitialized = false;
    
    // Try to reconnect after a delay
    console.log('Will attempt to reconnect in 5 seconds...');
    await sleep(5000);
    return connectToDatabase();
  }
}

// Start database connection
connectToDatabase();

// Middleware to check if database is connected
const checkDbConnection = (req, res, next) => {
  if (!isDbConnected || !dbInitialized) {
    return res.status(503).json({ 
      error: 'Database connection not established yet. Please try again in a few moments.' 
    });
  }
  next();
};

// Routes for CRUD operations
// Get all menu items
app.get('/api/menu-items', checkDbConnection, async (req, res) => {
  try {
    const query = 'SELECT * FROM menu_items';
    const result = await client.execute(query, [], { prepare: true });
    
    // Always send back an array
    const items = result.rows && Array.isArray(result.rows) ? result.rows : [];
    console.log(`Retrieved ${items.length} menu items`);
    
    res.json(items);
  } catch (err) {
    console.error('Error fetching menu items:', err);
    res.status(500).json({ 
      error: 'Failed to fetch menu items',
      details: err.message 
    });
  }
});

// Get menu item by ID
app.get('/api/menu-items/:id', checkDbConnection, async (req, res) => {
  try {
    const id = req.params.id;
    
    // Validate UUID format
    let uuid;
    try {
      uuid = cassandra.types.Uuid.fromString(id);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    const query = 'SELECT * FROM menu_items WHERE id = ?';
    const result = await client.execute(query, [uuid], { prepare: true });
    
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching menu item:', err);
    res.status(500).json({ 
      error: 'Failed to fetch menu item',
      details: err.message
    });
  }
});

// Create a new menu item
app.post('/api/menu-items', checkDbConnection, async (req, res) => {
  try {
    const { name, description, category, price, is_vegetarian } = req.body;
    
    // Validate required fields
    if (!name || !description || !category || price === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Convert values to appropriate types
    const id = cassandra.types.Uuid.random();
    const now = new Date();
    const priceValue = parseFloat(price);
    const isVegetarian = is_vegetarian === 'true' || is_vegetarian === true;
    
    console.log('Creating item with values:', { 
      id: id.toString(), 
      name, 
      category, 
      price: priceValue, 
      is_vegetarian: isVegetarian 
    });
    
    const query = `
      INSERT INTO menu_items (id, name, description, category, price, is_vegetarian, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await client.execute(query, [
      id, name, description, category, 
      priceValue, isVegetarian, now, now
    ], { prepare: true });
    
    res.status(201).json({ 
      id: id.toString(), 
      message: 'Menu item created successfully' 
    });
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ 
      error: 'Failed to create menu item',
      details: err.message
    });
  }
});

// Update a menu item
app.put('/api/menu-items/:id', checkDbConnection, async (req, res) => {
  try {
    const { name, description, category, price, is_vegetarian } = req.body;
    
    // Validate UUID format
    let uuid;
    try {
      uuid = cassandra.types.Uuid.fromString(req.params.id);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    // Validate required fields
    if (!name || !description || !category || price === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const now = new Date();
    const priceValue = parseFloat(price);
    const isVegetarian = is_vegetarian === 'true' || is_vegetarian === true;
    
    const query = `
      UPDATE menu_items 
      SET name = ?, description = ?, category = ?, price = ?, is_vegetarian = ?, updated_at = ?
      WHERE id = ?
    `;
    
    await client.execute(query, [
      name, description, category, priceValue, 
      isVegetarian, now, uuid
    ], { prepare: true });
    
    res.json({ message: 'Menu item updated successfully' });
  } catch (err) {
    console.error('Error updating menu item:', err);
    res.status(500).json({ 
      error: 'Failed to update menu item',
      details: err.message
    });
  }
});

// Delete a menu item
app.delete('/api/menu-items/:id', checkDbConnection, async (req, res) => {
  try {
    // Validate UUID format
    let uuid;
    try {
      uuid = cassandra.types.Uuid.fromString(req.params.id);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    const query = 'DELETE FROM menu_items WHERE id = ?';
    await client.execute(query, [uuid], { prepare: true });
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err) {
    console.error('Error deleting menu item:', err);
    res.status(500).json({ 
      error: 'Failed to delete menu item',
      details: err.message
    });
  }
});

// Search menu items
app.get('/api/search', checkDbConnection, async (req, res) => {
  try {
    const searchTerm = req.query.q ? req.query.q.toLowerCase() : '';
    
    if (!searchTerm) {
      // If no search term, return all items
      return res.redirect('/api/menu-items');
    }
    
    // In Cassandra, we can't use LIKE. We need to get all and filter
    const query = 'SELECT * FROM menu_items';
    const result = await client.execute(query, [], { prepare: true });
    
    // Make sure we have rows
    const rows = result.rows && Array.isArray(result.rows) ? result.rows : [];
    
    // Filter the results in-memory
    const filteredItems = rows.filter(item => 
      (item.name && item.name.toLowerCase().includes(searchTerm)) || 
      (item.description && item.description.toLowerCase().includes(searchTerm)) ||
      (item.category && item.category.toLowerCase().includes(searchTerm))
    );
    
    res.json(filteredItems);
  } catch (err) {
    console.error('Error searching menu items:', err);
    res.status(500).json({ 
      error: 'Failed to search menu items',
      details: err.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'UP',
    database: isDbConnected ? 'Connected' : 'Disconnected',
    initialized: dbInitialized ? 'Yes' : 'No'
  });
});

// Debug endpoint
app.get('/debug/db', (req, res) => {
  res.json({
    connected: isDbConnected,
    initialized: dbInitialized,
    contactPoints: client.options.contactPoints,
    datacenter: client.options.localDataCenter,
    clientState: client.getState ? client.getState() : 'Not available'
  });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed.');
  });
  await client.shutdown();
  console.log('Cassandra client shut down.');
  process.exit(0);
});
