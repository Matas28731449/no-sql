const express = require('express');
const { createClient } = require('redis');

const app = express();
const redisClient = createClient();

app.use(express.json());

// Register a user
app.put('/user', async function(req, res) {
    const { id, firstName, lastName } = req.body;

    if (!id || !firstName || !lastName) {
        return respondWithUserNotFound(res)
    }

    // Check if the user already exists
    const user = await redisClient.get(`User:${id}`);
    if (!user) {
        const userData = JSON.stringify({ id, firstName, lastName });
        await redisClient.set(`User:${id}`, userData);
        
        res.status(200).send("User registered successfully");
    } else {
        return respondWithUserExists(res)
    }
});

// Delete a user by ID
app.delete('/user/:userId', async function(req, res) {
    const userId = req.params.userId;

    // Check if the user exists
    const user = await redisClient.get(`User:${userId}`);
    if (user) {
        await redisClient.del(`User:${userId}`);
        res.status(200).send("User deleted successfully");
    } else {
        return respondWithUserNotFound(res)
    }
});

// GET endpoint to retrieve a user's viewed videos
app.get('/user/:userId/views', async function(req, res) {
    const userId = req.params.userId;
  
    // Check if the user exists by attempting to retrieve user data
    const user = await redisClient.get(`User:${userId}`);
    
    if (!user) {
        return respondWithUserNotFound(res)
    }
  
    // Retrieve the viewed videos list from DB
    const viewedVideos = await redisClient.sMembers(`User:${userId}:viewedVideos`);
  
    res.status(200).send(viewedVideos); // Return the viewed videos list
});

// PUT endpoint to register a new video
app.put('/video', async function(req, res) {
    const { id, description, lengthInS } = req.body;
  
    // Validate the input
    if (!id || !description || lengthInS === undefined) {
        return res.status(400).send("Video already exists");
    }
  
    // Check if the video already exists
    const video = await redisClient.get(`Video:${id}`);
    if (video) {
        res.status(400).send("Video already exists");
    } else {
        const videoData = JSON.stringify({ id, description, lengthInS });
        await redisClient.set(`Video:${id}`, videoData);
    
        res.status(200).send("Video registered successfully");
    }
});

// GET endpoint to retrieve information about a video by its ID
app.get('/video/:id', async function(req, res) {
    const videoId = req.params.id;
  
    // Retrieve the video from DB
    const video = await redisClient.get(`Video:${videoId}`);
    if (video) {
        res.status(200).send(JSON.parse(video));
    } else {
        return respondWithVideoNotFound(res)
    }
});

// GET endpoint to retrieve the views count for a video by its ID
app.get('/video/:id/views', async function(req, res) {
    const videoId = req.params.id;
  
    // Retrieve the video ID from DB
    const video = await redisClient.get(`Video:${videoId}`);
    
    if (!video) {
        return respondWithVideoNotFound(res)
    }
  
    // Retrieve the views count from DB
    const viewsCount = await redisClient.get(`Video:${videoId}:viewsCount`);
  
    // Return the views count, defaulting to 0 if it doesn't exist
    res.status(200).send({ views: viewsCount ? Number(viewsCount) : 0 });
});

// POST endpoint to register a video view for a specific video
app.post('/video/:id/views', async function(req, res) {
    const videoId = req.params.id;
    const { userId } = req.body;
  
    // Check if video exists
    const video = await redisClient.get(`Video:${videoId}`);
    if (!video) {
        return respondWithVideoNotFound(res)
    }
  
    // Check if user exists
    const user = await redisClient.get(`User:${userId}`);
    if (!user) {
        return respondWithUserNotFound(res)
    }
  
    // Increment the views count atomically
    await redisClient.incr(`Video:${videoId}:viewsCount`);
  
    // Track that the user has viewed this particular video
    await redisClient.sAdd(`User:${userId}:viewedVideos`, videoId);
  
    res.status(200).send("Video view registered successfully");
});

function respondWithUserExists(res) {
    res.status(400).send({ message: "User already exists"});
}

function respondWithUserNotFound(res) {
    res.status(404).send({ message: "User not found"});
}

function respondWithVideoNotFound(res) {
    res.status(400).send({ message: "Video not found"});
}

// Connection to DB
app.listen(8080, async () => {
    await redisClient.connect();
    console.log('Connected to Redis');
});
