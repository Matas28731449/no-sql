const express = require("express");
const neo4j = require("neo4j-driver");

const app = express();
const driver = neo4j.driver(
  "bolt://localhost:7687",
  neo4j.auth.basic("neo4j", "password")
);

app.use(express.json());
const neo4jClient = driver.session();



// Start the server
app.listen(8080, async () => {
  console.log("Connected to Neo4J");
});
