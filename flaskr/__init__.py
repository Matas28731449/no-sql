from flask import Flask, jsonify, request
from flask_pymongo import PyMongo
from pymongo import MongoClient
from bson.objectid import ObjectId

app = Flask(__name__)
app.config["MONGO_URI"] = "mongodb://root:pass@localhost:27017/warehouseDB?authSource=admin"
mongo = PyMongo(app)

warehouses_collection = mongo.db.warehouses
products_collection = mongo.db.products
inventory_collection = mongo.db.inventory

# PUT: Register a new product
@app.route('/products', methods=['PUT'])
def register_product():
    data = request.get_json()
    if not data or 'name' not in data or 'price' not in data:
        return jsonify({"error": "Invalid input, missing name or price"}), 400

    # Check if an ID is provided
    if "id" in data:
        try:
            provided_id = int(data["id"])
        except ValueError:
            return jsonify({"error": "Invalid ID format"}), 400

        # Ensure the provided ID is unique
        existing_product = products_collection.find_one({"id": provided_id})
        if existing_product:
            return jsonify({"error": "ID already exists"}), 400

        product_id = provided_id
    else:
        # Generate a new sequential ID if no ID is provided
        max_product = products_collection.find_one(sort=[("id", -1)])
        product_id = (max_product["id"] + 1) if max_product else 0

    new_product = {
        "id": product_id,
        "name": data["name"],
        "category": data.get("category", ""),
        "price": data["price"]
    }
    products_collection.insert_one(new_product)
    return jsonify({"id": product_id}), 201

# GET: List all products
@app.route('/products', methods=['GET'])
def list_products():
    category = request.args.get('category')
    query = {"category": category} if category else {}
    products = list(products_collection.find(query, {"_id": 0}))
    return jsonify(products), 200

# GET: Get product details by ID
@app.route('/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    product = products_collection.find_one({"id": product_id}, {"_id": 0})
    if not product:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(product), 200

# DELETE: Delete a product
@app.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    result = products_collection.delete_one({"id": product_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Product not found"}), 404
    return jsonify({"message": "Product deleted"}), 204

# PUT: Register a new warehouse
@app.route('/warehouses', methods=['PUT'])
def register_warehouse():
    data = request.get_json()
    if not data or 'name' not in data or 'location' not in data or 'capacity' not in data:
        return jsonify({"error": "Invalid input, missing name, location, or capacity"}), 400

    max_warehouse = warehouses_collection.find_one(sort=[("id", -1)])
    new_warehouse_id = (max_warehouse["id"] + 1) if max_warehouse else 0

    new_warehouse = {
        "id": new_warehouse_id,
        "name": data["name"],
        "location": data["location"],
        "capacity": data["capacity"]
    }
    warehouses_collection.insert_one(new_warehouse)
    return jsonify({"id": new_warehouse_id}), 201

# GET: Get warehouse details by ID
@app.route('/warehouses/<int:warehouse_id>', methods=['GET'])
def get_warehouse(warehouse_id):
    warehouse = warehouses_collection.find_one({"id": warehouse_id}, {"_id": 0})
    if not warehouse:
        return jsonify({"error": "Warehouse not found"}), 404
    return jsonify(warehouse), 200

# DELETE: Delete a warehouse by ID
@app.route('/warehouses/<int:warehouse_id>', methods=['DELETE'])
def delete_warehouse(warehouse_id):
    result = warehouses_collection.delete_one({"id": warehouse_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Warehouse not found"}), 404

    # Delete associated inventory
    inventory_collection.delete_many({"warehouseId": warehouse_id})
    return jsonify({"message": "Warehouse and associated inventory deleted"}), 204

# PUT: Add a product to a warehouse's inventory
@app.route('/warehouses/<int:warehouse_id>/inventory', methods=['PUT'])
def add_inventory(warehouse_id):
    data = request.get_json()

    # Validate required fields
    if not data or 'productId' not in data or 'quantity' not in data:
        return jsonify({"error": "Invalid input, missing productId or quantity"}), 400
    product_id = data['productId']
    quantity = data['quantity']

    # Ensure valid quantity
    if quantity < 0:
        return jsonify({"error": "Invalid quantity, must be non-negative"}), 400

    # Check if the warehouse exists
    warehouse = warehouses_collection.find_one({"id": warehouse_id})
    if not warehouse:
        return jsonify({"error": "Warehouse not found"}), 404

    # Check if the product exists
    product = products_collection.find_one({"id": product_id})
    if not product:
        return jsonify({"error": "Product not found"}), 404

    # Calculate total inventory quantity in the warehouse
    current_inventory = list(inventory_collection.find({"warehouseId": warehouse_id}))
    total_quantity = sum(item["quantity"] for item in current_inventory)

    # Check if there's enough capacity in the warehouse
    if total_quantity + quantity > warehouse["capacity"]:
        return jsonify({"error": "Insufficient warehouse capacity"}), 400

    # Generate a new inventory ID manually (max of existing inventory IDs + 1)
    max_inventory = inventory_collection.find_one(sort=[("id", -1)])  # Sort by ID in descending order
    new_inventory_id = (max_inventory["id"] + 1) if max_inventory else 1  # Start with 1 if no inventory exists

    # Check if the inventory document exists for this product and warehouse
    existing_inventory = inventory_collection.find_one({"warehouseId": warehouse_id, "productId": product_id})

    if existing_inventory:
        # Update existing inventory quantity
        inventory_collection.update_one(
            {"warehouseId": warehouse_id, "productId": product_id},
            {"$inc": {"quantity": quantity}}
        )
        return jsonify({"id": new_inventory_id}), 200
    else:
        # Insert new inventory document with custom generated ID
        new_inventory = {
            "id": new_inventory_id,
            "warehouseId": warehouse_id,
            "productId": product_id,
            "quantity": quantity
        }
        inventory_collection.insert_one(new_inventory)
        return jsonify({"id": new_inventory_id}), 201

# GET: Retrieve inventory of products in a warehouse
@app.route('/warehouses/<int:warehouse_id>/inventory', methods=['GET'])
def get_inventory(warehouse_id):
    warehouse = warehouses_collection.find_one({"id": warehouse_id})
    if not warehouse:
        return jsonify({"error": "Warehouse not found"}), 404

    inventory = list(inventory_collection.find({"warehouseId": warehouse_id}, {"_id": 0}))
    if not inventory:
        return jsonify({"error": "No inventory found for this warehouse"}), 404

    return jsonify(inventory), 200

# GET: Retrieve specific inventory details in a warehouse
@app.route('/warehouses/<int:warehouse_id>/inventory/<int:inventory_id>', methods=['GET'])
def get_inventory_details(warehouse_id, inventory_id):
    try:
        # Check if warehouse exists
        warehouse = warehouses_collection.find_one({"id": warehouse_id})
        if not warehouse:
            return jsonify({"error": "Warehouse not found"}), 404

        # Find the specific inventory item by warehouseId and inventoryId
        inventory_item = inventory_collection.find_one({
            "warehouseId": warehouse_id,
            "id": inventory_id
        })

        # Check if the inventory item exists
        if not inventory_item:
            return jsonify({"error": "Inventory not found"}), 404

        # Respond with inventory item details, using custom 'id' instead of MongoDB's '_id'
        response = {
            "id": inventory_item["id"],  # Custom generated ID
            "productId": inventory_item["productId"],
            "quantity": inventory_item["quantity"]
        }

        return jsonify(response), 200
    except Exception as error:
        print(f"Error retrieving inventory details: {error}")
        return jsonify({"error": "Failed to retrieve inventory details"}), 500

# DELETE: Remove a specific inventory item
@app.route('/warehouses/<int:warehouse_id>/inventory/<int:inventory_id>', methods=['DELETE'])
def remove_inventory(warehouse_id, inventory_id):
    result = inventory_collection.delete_one({"warehouseId": warehouse_id, "id": inventory_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Inventory item not found"}), 404
    return jsonify({"message": "Inventory item removed"}), 204

# GET: Calculate total value of products in a warehouse
@app.route('/warehouses/<int:warehouse_id>/value', methods=['GET'])
def calculate_total_value(warehouse_id):
    warehouse = warehouses_collection.find_one({"id": warehouse_id})
    if not warehouse:
        return jsonify({"error": "Warehouse not found"}), 404

    pipeline = [
        {"$match": {"warehouseId": warehouse_id}},
        {
            "$lookup": {
                "from": "products",
                "localField": "productId",
                "foreignField": "id",
                "as": "productDetails"
            }
        },
        {"$unwind": {"path": "$productDetails", "preserveNullAndEmptyArrays": False}},
        {
            "$group": {
                "_id": None,
                "value": {"$sum": {"$multiply": ["$quantity", "$productDetails.price"]}}
            }
        }
    ]
    result = list(inventory_collection.aggregate(pipeline))
    total_value = result[0]["value"] if result else 0

    return jsonify({"value": total_value}), 200

# GET: Warehouse capacity statistics
@app.route('/statistics/warehouse/capacity', methods=['GET'])
def warehouse_capacity_statistics():
    warehouses = list(warehouses_collection.find({}, {"_id": 0}))
    total_capacity = sum(warehouse["capacity"] for warehouse in warehouses)
    used_capacity = sum(
        sum(item["quantity"] for item in inventory_collection.find({"warehouseId": warehouse["id"], "quantity": {"$gte": 0}}))
        for warehouse in warehouses
    )
    free_capacity = total_capacity - used_capacity

    return jsonify({
        "totalCapacity": total_capacity,
        "usedCapacity": used_capacity,
        "freeCapacity": free_capacity
    }), 200

# GET: Statistics on product categories
@app.route('/statistics/products/by/category', methods=['GET'])
def product_category_statistics():
    pipeline = [
        {"$match": {"category": {"$exists": True, "$ne": ""}}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$project": {"category": "$_id", "count": 1, "_id": 0}}
    ]
    categories_stats = list(products_collection.aggregate(pipeline))
    return jsonify(categories_stats), 200

# POST: Cleanup for testing purposes
@app.route('/cleanup', methods=['POST'])
def cleanup_database():
    products_collection.delete_many({})
    warehouses_collection.delete_many({})
    inventory_collection.delete_many({})
    return jsonify({"message": "Cleanup completed"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
