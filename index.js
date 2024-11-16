const express = require("express");
const neo4j = require("neo4j-driver");

const app = express();
const driver = neo4j.driver(
  "bolt://localhost:7687",
  neo4j.auth.basic("neo4j", "password")
);

app.use(express.json());
const neo4jClient = driver.session();

app.put("/cities", async (req, res) => {
  const { name, country } = req.body;

  // Check for missing mandatory attributes
  if (!name || !country) {
    return res
      .status(400)
      .send("Could not register the city, mandatory attributes are missing");
  }

  try {
    // Query to check if the city already exists
    const checkCityQuery = `MATCH (c:City {name: $name, country: $country}) RETURN c`;
    const checkCityResult = await neo4jClient.run(checkCityQuery, {
      name,
      country,
    });

    // If the city already exists, return a 400 status
    if (checkCityResult.records.length > 0) {
      return res
        .status(400)
        .send("Could not register the city, it already exists");
    }

    // Query to create the city if it doesn't exist
    const createCityQuery = `
        CREATE (c:City {name: $name, country: $country})
        RETURN c
      `;
    await neo4jClient.run(createCityQuery, { name, country });

    // Return success response
    res.status(201).send("City registered successfully");
  } catch (error) {
    console.error("Error registering city:", error);
  }
});

app.get("/cities", async (req, res) => {
  const { country } = req.query;

  try {
    // Build the query depending on whether a country filter is provided
    let getCitiesQuery;
    let params = {};

    if (country) {
      // If country filter is provided, match cities by country
      getCitiesQuery = `MATCH (c:City {country: $country}) RETURN c.name AS name, c.country AS country`;
      params = { country };
    } else {
      // Otherwise, return all cities
      getCitiesQuery = `MATCH (c:City) RETURN c.name AS name, c.country AS country`;
    }

    // Run the query
    const result = await neo4jClient.run(getCitiesQuery, params);

    // Extract city data from the result
    const cities = result.records.map((record) => ({
      name: record.get("name"),
      country: record.get("country"),
    }));

    // Send the response
    res.status(200).json(cities);
  } catch (error) {
    console.error("Error fetching cities:", error);
  }
});

app.get("/cities/:name", async (req, res) => {
  const { name } = req.params;

  try {
    // Query to find the city by name
    const getCityQuery = `
        MATCH (c:City {name: $name})
        RETURN c.name AS name, c.country AS country
      `;

    const result = await neo4jClient.run(getCityQuery, { name });

    // Check if the city was found
    if (result.records.length === 0) {
      return res.status(404).send("City not found");
    }

    // Extract the city details
    const record = result.records[0];
    const city = {
      name: record.get("name"),
      country: record.get("country"),
    };

    // Send the response
    res.status(200).json(city);
  } catch (error) {
    console.error("Error fetching city:", error);
  }
});

app.put("/cities/:name/airports", async (req, res) => {
  const { name } = req.params;
  const { code, airportName, numberOfTerminals, address } = req.body;

  // Check for mandatory airport attributes
  if (!airportName) {
    return res
      .status(400)
      .send("Airport could not be created due to missing data");
  }

  try {
    // Check if the city exists
    const cityQuery = `MATCH (c:City {name: $name}) RETURN c`;
    const cityResult = await neo4jClient.run(cityQuery, { name });

    if (cityResult.records.length === 0) {
      return res.status(400).send("City not found, cannot register airport.");
    }

    // Check if the airport already exists in the city
    const airportExistQuery = `
        MATCH (c:City {name: $name})-[:HAS_AIRPORT]->(a:Airport {code: $code})
        RETURN a
      `;
    const airportExistResult = await neo4jClient.run(airportExistQuery, {
      name,
      code,
    });

    if (airportExistResult.records.length > 0) {
      return res.status(400).send("Airport already exists in this city");
    }

    // Create or link the airport node to the city
    const createAirportQuery = `
        MATCH (c:City {name: $name})
        CREATE (a:Airport {code: $code, name: $airportName, numberOfTerminals: $numberOfTerminals, address: $address})
        MERGE (c)-[:HAS_AIRPORT]->(a)
        RETURN a
      `;
    await neo4jClient.run(createAirportQuery, {
      name,
      code,
      airportName,
      numberOfTerminals,
      address,
    });

    res.status(201).send("Airport created successfully");
  } catch (error) {
    console.error("Error creating airport:", error);
  }
});

app.get("/cities/:name/airports", async (req, res) => {
  const { name } = req.params;

  try {
    // Query to find the airports linked to the specified city
    const getAirportsQuery = `
        MATCH (c:City {name: $name})-[:HAS_AIRPORT]->(a:Airport)
        RETURN a.code AS code, c.name AS city, a.name AS name, a.numberOfTerminals AS numberOfTerminals, a.address AS address
      `;

    const result = await neo4jClient.run(getAirportsQuery, { name });

    // Check if any airports are found
    if (result.records.length === 0) {
      return res.status(404).send(`No airports found in ${name}`);
    }

    // Extract airport data from the result
    const airports = result.records.map((record) => ({
      code: record.get("code"),
      city: record.get("city"),
      name: record.get("name"),
      numberOfTerminals: record.get("numberOfTerminals"),
      address: record.get("address"),
    }));

    // Send the response with airport details
    res.status(200).json(airports);
  } catch (error) {
    console.error("Error fetching airports:", error);
  }
});

app.get("/airports/:code", async (req, res) => {
  const { code } = req.params;

  try {
    // Query the airport by code
    const airportQuery = `
        MATCH (a:Airport {code: $code})-[:HAS_AIRPORT]->(c:City)
        RETURN a, c
      `;
    const airportResult = await neo4jClient.run(airportQuery, { code });

    // Check if the airport was found
    if (airportResult.records.length === 0) {
      return res.status(404).send("Airport not found");
    }

    // Extract airport and city data from the query result
    const airportRecord = airportResult.records[0];
    const airportNode = airportRecord.get("a");
    const cityNode = airportRecord.get("c");

    // Prepare the response
    const airportResponse = {
      code: airportNode.properties.code,
      city: cityNode.properties.name,
      name: airportNode.properties.name,
      numberOfTerminals: airportNode.properties.numberOfTerminals,
      address: airportNode.properties.address,
    };

    // Send the airport data
    res.status(200).json(airportResponse);
  } catch (error) {
    console.error("Error fetching airport:", error);
    res.status(500).send("An error occurred while fetching the airport.");
  }
});

// Start the server
app.listen(8080, async () => {
  console.log("Connected to Neo4J");
});
