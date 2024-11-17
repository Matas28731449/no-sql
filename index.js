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
    res.status(204).send("City registered successfully");
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

app.put("/cities/:city_name/airports", async (req, res) => {
  const { city_name } = req.params;
  const { code, name, city, numberOfTerminals, address } = req.body;

  // Validate mandatory attributes
  if (!code || !name || !city || !numberOfTerminals || !address) {
    return res
      .status(400)
      .send("Airport could not be created due to missing or invalid data");
  }

  try {
    // Ensure the provided city matches the `city_name` parameter
    if (city !== city_name) {
      return res
        .status(400)
        .send(
          `The city name in the URL (${city_name}) does not match the body (${city}).`
        );
    }

    // Check if the city exists
    const cityQuery = `MATCH (c:City {name: $city_name}) RETURN c`;
    const cityResult = await neo4jClient.run(cityQuery, { city_name });

    if (cityResult.records.length === 0) {
      return res.status(404).send("City not found, cannot register airport");
    }

    // Check if the airport already exists
    const airportExistQuery = `
          MATCH (c:City {name: $city_name})-[:HAS_AIRPORT]->(a:Airport {code: $code})
          RETURN a
        `;
    const airportExistResult = await neo4jClient.run(airportExistQuery, {
      city_name,
      code,
    });

    if (airportExistResult.records.length > 0) {
      return res.status(400).send("Airport already exists in this city");
    }

    // Create the airport node and link it to the city
    const createAirportQuery = `
          MATCH (c:City {name: $city_name})
          CREATE (a:Airport {code: $code, name: $name, numberOfTerminals: $numberOfTerminals, address: $address})
          MERGE (c)-[:HAS_AIRPORT]->(a)
          RETURN a
        `;
    const result = await neo4jClient.run(createAirportQuery, {
      city_name,
      code,
      name,
      numberOfTerminals,
      address,
    });

    res.status(204).send("Airport created successfully");
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
        MATCH (c:City)-[:HAS_AIRPORT]->(a:Airport {code: $code})
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
  }
});

app.put("/flights", async (req, res) => {
  const {
    number,
    fromAirport,
    toAirport,
    price,
    flightTimeInMinutes,
    operator,
  } = req.body;

  // Validate required fields
  if (
    !number ||
    !fromAirport ||
    !toAirport ||
    !price ||
    !flightTimeInMinutes ||
    !operator
  ) {
    return res
      .status(400)
      .send("Flight could not be registered due to missing data");
  }

  try {
    // Check if the departure airport exists
    const fromAirportQuery = `MATCH (a:Airport {code: $fromAirport}) RETURN a`;
    const fromAirportResult = await neo4jClient.run(fromAirportQuery, {
      fromAirport,
    });

    if (fromAirportResult.records.length === 0) {
      return res
        .status(400)
        .send("Departure airport not found, cannot register flight");
    }

    // Check if the arrival airport exists
    const toAirportQuery = `MATCH (a:Airport {code: $toAirport}) RETURN a`;
    const toAirportResult = await neo4jClient.run(toAirportQuery, {
      toAirport,
    });

    if (toAirportResult.records.length === 0) {
      return res
        .status(400)
        .send("Arrival airport not found, cannot register flight");
    }

    // Check if the flight already exists
    const flightExistQuery = `
        MATCH (from:Airport {code: $fromAirport})-[f:FLIGHT]->(to:Airport {code: $toAirport})
        WHERE f.number = $number
        RETURN f
      `;
    const flightExistResult = await neo4jClient.run(flightExistQuery, {
      fromAirport,
      toAirport,
      number,
    });

    if (flightExistResult.records.length > 0) {
      return res
        .status(400)
        .send(
          "Flight with the same number already exists between these airports"
        );
    }

    // Create the flight relationship between the airports
    const createFlightQuery = `
        MATCH (from:Airport {code: $fromAirport}), (to:Airport {code: $toAirport})
        CREATE (from)-[f:FLIGHT {
          number: $number,
          price: $price,
          flightTimeInMinutes: $flightTimeInMinutes,
          operator: $operator
        }]->(to)
        RETURN f
      `;
    const flightResult = await neo4jClient.run(createFlightQuery, {
      fromAirport,
      toAirport,
      number,
      price,
      flightTimeInMinutes,
      operator,
    });

    if (flightResult.records.length === 0) {
      return res.status(500).send("Failed to register the flight");
    }

    res.status(204).send("Flight registered successfully");
  } catch (error) {
    console.error("Error registering flight:", error);
  }
});

app.get("/flights/:code", async (req, res) => {
  const { code } = req.params;

  try {
    // Query to find the flight by its code
    const flightQuery = `
      MATCH (from:Airport)-[f:FLIGHT {number: $code}]->(to:Airport)
      MATCH (from)<-[:HAS_AIRPORT]-(fromCity:City), (to)<-[:HAS_AIRPORT]-(toCity:City)
      RETURN 
        f.number AS number,
        from.code AS fromAirport, 
        fromCity.name AS fromCity,
        to.code AS toAirport, 
        toCity.name AS toCity,
        f.price AS price,
        f.flightTimeInMinutes AS flightTimeInMinutes,
        f.operator AS operator
    `;
    const flightResult = await neo4jClient.run(flightQuery, { code });

    // Check if the flight was found
    if (flightResult.records.length === 0) {
      return res.status(404).send("Flight not found");
    }

    // Extract flight data
    const record = flightResult.records[0];
    const flight = {
      number: record.get("number"),
      fromAirport: record.get("fromAirport"),
      fromCity: record.get("fromCity"),
      toAirport: record.get("toAirport"),
      toCity: record.get("toCity"),
      price: record.get("price"),
      flightTimeInMinutes: record.get("flightTimeInMinutes"),
      operator: record.get("operator"),
    };

    // Send the flight details as response
    res.status(200).json(flight);
  } catch (error) {
    console.error("Error fetching flight information:", error);
  }
});

app.get("/search/flights/:fromCity/:toCity", async (req, res) => {
  const { fromCity, toCity } = req.params;

  try {
    const searchFlightsQuery = `
      MATCH path = (fromCity:City {name: $fromCity})-[:HAS_AIRPORT]->(fromAirport:Airport)-[:FLIGHT*1..3]->(toAirport:Airport)<-[:HAS_AIRPORT]-(toCity:City {name: $toCity})
      WITH fromAirport, toAirport, relationships(path) AS flights, 
          reduce(totalPrice = 0, flight IN relationships(path) | totalPrice + COALESCE(flight.price, 0)) AS totalPrice,
          reduce(totalTime = 0, flight IN relationships(path) | totalTime + COALESCE(flight.flightTimeInMinutes, 0)) AS totalTime
      RETURN 
          fromAirport.code AS fromAirportCode, 
          toAirport.code AS toAirportCode,
          [rel IN flights | COALESCE(rel.number, "Unknown Flight Number")] AS flights,
          totalPrice AS price,
          totalTime AS timeInMinutes
      ORDER BY totalPrice
    `;

    const result = await neo4jClient.run(searchFlightsQuery, {
      fromCity,
      toCity,
    });

    if (result.records.length === 0) {
      return res
        .status(404)
        .send("No flights found between the specified cities");
    }

    const flights = result.records.map((record) => ({
      fromAirport: record.get("fromAirportCode") || "Unknown Airport",
      toAirport: record.get("toAirportCode") || "Unknown Airport",
      flights: record
        .get("flights")
        .filter((flight) => flight !== "Unknown Flight Number"), // Remove "Unknown Flight Number" entries
      price: record.get("price") || 0,
      timeInMinutes: record.get("timeInMinutes") || 0,
    }));

    // Only include the flights array if it's not empty
    const cleanedFlights = flights.map((flight) => ({
      ...flight,
      flights:
        flight.flights.length > 0 ? flight.flights : ["No flight available"],
    }));

    res.status(200).json(cleanedFlights);
  } catch (error) {
    console.error("Error searching for flights:", error);
  }
});

app.post("/cleanup", async (req, res) => {
  try {
    // Query to remove all flights, airports, and relationships
    const cleanupQuery = `
      MATCH (n)
      DETACH DELETE n
    `;
    await neo4jClient.run(cleanupQuery);

    // Send a success response
    res.status(200).send("Cleanup successful");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
});

// Start the server
app.listen(8080, async () => {
  console.log("Connected to Neo4J");
});
