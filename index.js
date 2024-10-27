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
            category: product.category,
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
        await db.collection('inventory').deleteMany({ warehouseId });

        // Respond with 204 if deletion was successful
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete warehouse' });
    }
});

// PUT endpoint to add a product to a warehouse's inventory
app.put('/warehouses/:warehouseId/inventory', async (req, res) => {
    const { warehouseId } = req.params;
    const { productId, quantity } = req.body;

    // Validate required fields
    if (!productId || quantity == null || quantity < 0) {
        return res.status(400).json({ error: 'Invalid input, missing productId or quantity, or quantity is invalid' });
    }

    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');
        const productsCollection = db.collection('products');
        const inventoryCollection = db.collection('inventory');

        // Check if warehouse exists
        const warehouse = await warehousesCollection.findOne({ id: warehouseId });
        if (!warehouse) {
            return res.status(404).json({ error: 'Warehouse not found' });
        }

        // Check if product exists
        const product = await productsCollection.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Check if there's enough capacity in the warehouse
        const currentInventory = await inventoryCollection.aggregate([
            { $match: { warehouseId: warehouseId } },
            { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } }
        ]).toArray();
        const totalCurrentQuantity = currentInventory[0]?.totalQuantity || 0;
        
        if (totalCurrentQuantity + quantity > warehouse.capacity) {
            return res.status(400).json({ error: 'Insufficient warehouse capacity' });
        }

        // Check if inventory document exists for this product and warehouse
        const existingInventory = await inventoryCollection.findOne({ warehouseId, productId });

        if (existingInventory) {
            // Update existing inventory quantity
            await inventoryCollection.updateOne(
                { warehouseId, productId },
                { $inc: { quantity: quantity } }
            );
            res.status(200).json({ id: existingInventory.id });
        } else {
            // Insert new inventory document with generated id
            const inventoryDoc = {
                id: new ObjectId().toString(),
                warehouseId,
                productId,
                quantity
            };
            await inventoryCollection.insertOne(inventoryDoc);
            res.status(201).json({ id: inventoryDoc.id });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add product to warehouse inventory' });
    }
});

// GET endpoint to retrieve inventory of products in a warehouse
app.get('/warehouses/:warehouseId/inventory', async (req, res) => {
    const { warehouseId } = req.params;

    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');
        const inventoryCollection = db.collection('inventory');

        // Check if warehouse exists
        const warehouse = await warehousesCollection.findOne({ id: warehouseId });
        if (!warehouse) {
            return res.status(404).json({ error: 'Warehouse not found' });
        }

        // Retrieve inventory for the specified warehouse
        const inventory = await inventoryCollection.find({ warehouseId }).toArray();

        // Check if inventory exists for the warehouse
        if (inventory.length === 0) {
            return res.status(404).json({ error: 'No inventory found for this warehouse' });
        }

        // Format the response to include only the required fields
        const response = inventory.map(item => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
        }));

        res.status(200).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve inventory' });
    }
});

// GET endpoint to retrieve specific inventory details in a warehouse
app.get('/warehouses/:warehouseId/inventory/:inventoryId', async (req, res) => {
    const { warehouseId, inventoryId } = req.params;

    try {
        const db = mongoClient.db();
        const inventoryCollection = db.collection('inventory');

        // Find the specific inventory item by warehouseId and inventoryId
        const inventoryItem = await inventoryCollection.findOne({
            warehouseId,
            id: inventoryId,
        });

        // Check if the inventory item exists
        if (!inventoryItem) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Respond with inventory item details
        res.status(200).json({
            id: inventoryItem.id,
            productId: inventoryItem.productId,
            quantity: inventoryItem.quantity,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve inventory details' });
    }
});

// DELETE endpoint to remove a product from inventory in a warehouse
app.delete('/warehouses/:warehouseId/inventory/:inventoryId', async (req, res) => {
    const { warehouseId, inventoryId } = req.params;

    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');
        const inventoryCollection = db.collection('inventory');

        // Check if the warehouse exists
        const warehouse = await warehousesCollection.findOne({ id: warehouseId });
        if (!warehouse) {
            return res.status(404).json({ error: 'Warehouse not found' });
        }

        // Remove the specific inventory item
        const result = await inventoryCollection.deleteOne({
            warehouseId,
            id: inventoryId,
        });

        // Check if the inventory item was found and deleted
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Respond with 204 No Content if deletion is successful
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to remove product from inventory' });
    }
});

// GET endpoint to get the total value of products in a warehouse
app.get('/warehouses/:warehouseId/value', async (req, res) => {
    const { warehouseId } = req.params;

    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');
        const inventoryCollection = db.collection('inventory');
        const productsCollection = db.collection('products');

        // Check if the warehouse exists
        const warehouse = await warehousesCollection.findOne({ id: warehouseId });
        if (!warehouse) {
            return res.status(404).json({ error: 'Warehouse not found' });
        }

        // Aggregate total value of products in the warehouse
        const totalValue = await inventoryCollection.aggregate([
            { $match: { warehouseId } }, // Match inventory items for the specific warehouse
            {
                $lookup: {
                    from: 'products', // Join with the products collection
                    localField: 'productId',
                    foreignField: 'id',
                    as: 'productDetails',
                },
            },
            { $unwind: '$productDetails' }, // Unwind to get product details
            {
                $group: {
                    _id: null,
                    totalValue: { $sum: { $multiply: ['$quantity', '$productDetails.price'] } }, // Calculate total value
                },
            },
        ]).toArray();

        const value = totalValue.length > 0 ? totalValue[0].totalValue : 0;

        // Respond with the total value
        res.status(200).json({ value });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to calculate total value of products' });
    }
});

// GET endpoint to get statistics on warehouse capacity
app.get('/statistics/warehouse/capacity', async (req, res) => {
    try {
        const db = mongoClient.db();
        const warehousesCollection = db.collection('warehouses');
        const inventoryCollection = db.collection('inventory');

        // Get all warehouses
        const warehouses = await warehousesCollection.find().toArray();

        // Calculate total capacity and used capacity
        let totalCapacity = 0;
        let usedCapacity = 0;

        for (const warehouse of warehouses) {
            totalCapacity += warehouse.capacity; // Sum up the total capacity of all warehouses

            // Get the used capacity for the current warehouse
            const inventoryItems = await inventoryCollection.find({ warehouseId: warehouse.id }).toArray();
            for (const item of inventoryItems) {
                usedCapacity += item.quantity; // Sum up the quantity of products in the inventory
            }
        }

        // Calculate free capacity
        const freeCapacity = totalCapacity - usedCapacity;

        // Respond with statistics
        res.status(200).json({
            usedCapacity,
            freeCapacity,
            totalCapacity,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve warehouse capacity statistics' });
    }
});

// GET endpoint to get statistics on product categories
app.get('/statistics/products/by/category', async (req, res) => {
    try {
        const db = mongoClient.db();
        const productsCollection = db.collection('products');

        // Group products by category and count them
        const categoriesStats = await productsCollection.aggregate([
            {
                $group: {
                    _id: '$category', // Group by category
                    count: { $sum: 1 } // Count the number of products in each category
                }
            },
            {
                $project: {
                    category: '$_id', // Rename _id to category
                    count: 1, // Include count in the output
                    _id: 0 // Exclude the default _id field
                }
            }
        ]).toArray();

        // Respond with the statistics
        res.status(200).json(categoriesStats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to retrieve product category statistics' });
    }
});

// POST endpoint to clear the database for testing purposes
app.post('/cleanup', async (req, res) => {
    try {
        const db = mongoClient.db();
        
        // Drop collections to clear all data
        await db.collection('products').deleteMany({});
        await db.collection('warehouses').deleteMany({});
        await db.collection('inventory').deleteMany({});

        res.status(200).json({ message: 'Cleanup completed.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to clean up the database' });
    }
});

// Start the server
app.listen(8080, async () => {
    await mongoClient.connect();
    console.log('Connected to MongoDB');
});
