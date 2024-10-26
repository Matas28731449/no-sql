const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const mongoClient = new MongoClient('mongodb://root:pass@localhost:27017/warehouseDB?authSource=admin', { useUnifiedTopology: true });

app.use(express.json());

// PUT endpoint to register a new product
app.put('/products', async (req, res) => {
    const { id, name, category, price } = req.body;

    // Validation: check for required fields
    if (!name || price == null) {
        return res.status(400).json({ error: 'Invalid input, missing name or price' });
    }

    try {
        const db = mongoClient.db();
        const productsCollection = db.collection('products');

        // Create the product document
        const product = {
            id: id || new ObjectId().toString(), // Generate ID if not provided
            name,
            category,
            price,
        };

        // Insert the product
        await productsCollection.insertOne(product);

        // Respond with success
        res.status(201).json({ id: product.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to register product' });
    }
});

// GET endpoint to list all products, optionally filtered by category
app.get('/products', async (req, res) => {
    const { category } = req.query;

    try {
        const db = mongoClient.db();
        const productsCollection = db.collection('products');

        // Build query based on optional category filter
        const query = category ? { category } : {};

        // Find products
        const products = await productsCollection.find(query).toArray();

        // Map results to match response schema
        const response = products.map(product => ({
            id: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
        }));

        res.status(200).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve products' });
    }
});

// GET endpoint to get product details by productId
app.get('/products/:productId', async (req, res) => {
    const { productId } = req.params;

    try {
        const db = mongoClient.db();
        const productsCollection = db.collection('products');

        // Find product by productId
        const product = await productsCollection.findOne({ id: productId });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Respond with product details
        res.status(200).json({
            id: product.id,
            name: product.name,
            price: product.price,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve product details' });
    }
});

// DELETE endpoint to delete a product by productId
app.delete('/products/:productId', async (req, res) => {
    const { productId } = req.params;

    try {
        const db = mongoClient.db();
        const productsCollection = db.collection('products');

        // Attempt to delete the product by productId
        const result = await productsCollection.deleteOne({ id: productId });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Respond with 204 if deletion was successful
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// PUT endpoint to register a new warehouse
app.put('/warehouses', async (req, res) => {
    const { name, location, capacity } = req.body;

    // Validation: check for required fields
    if (!name || !location || capacity == null) {
        return res.status(400).json({ error: 'Invalid input, missing name, location, or capacity' });
    }

    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');

        // Create the warehouse document
        const warehouse = {
            id: new ObjectId().toString(), // Generate ID
            name,
            location,
            capacity,
        };

        // Insert the warehouse
        await warehousesCollection.insertOne(warehouse);

        // Respond with success and the generated ID
        res.status(201).json({ id: warehouse.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to register warehouse' });
    }
});

// GET endpoint to get warehouse details by warehouseId
app.get('/warehouses/:warehouseId', async (req, res) => {
    const { warehouseId } = req.params;

    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');

        // Find warehouse by warehouseId
        const warehouse = await warehousesCollection.findOne({ id: warehouseId });

        if (!warehouse) {
            return res.status(404).json({ error: 'Warehouse not found' });
        }

        // Respond with warehouse details
        res.status(200).json({
            id: warehouse.id,
            name: warehouse.name,
            location: warehouse.location,
            capacity: warehouse.capacity,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve warehouse details' });
    }
});

// DELETE endpoint to delete a warehouse by warehouseId
app.delete('/warehouses/:warehouseId', async (req, res) => {
    const { warehouseId } = req.params;

    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');

        // Attempt to delete the warehouse by warehouseId
        const result = await warehousesCollection.deleteOne({ id: warehouseId });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Warehouse not found' });
        }

        // Optionally, delete associated inventory if there's a relationship (assuming inventory is stored in a separate collection)
        // await db.collection('inventory').deleteMany({ warehouseId });

        // Respond with 204 if deletion was successful
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete warehouse' });
    }
});

// Start the server
app.listen(3000, async () => {
    await mongoClient.connect();
    console.log('Connected to MongoDB');
});
