const express = require('express');
const cassandra = require('cassandra-driver');

const app = express();
const cassandraClient = new cassandra.Client({
    contactPoints: ['localhost'],
    localDataCenter: 'datacenter1',
    keyspace: 'video_platform'
});

app.use(express.json());

/*
 *  Base `channels` table
 *
 *  CREATE TABLE IF NOT EXISTS video_platform.channels (
 *      id TEXT PRIMARY KEY,
 *      name TEXT,
 *      owner TEXT
 *  );
 */

/*
 *  Cassandra does not allow filtering on non-primary key columns without using ALLOW FILTERING,
 *  so we have to create an additional table for querying by parameter (in our case by owner)
 *
 *  CREATE TABLE IF NOT EXISTS video_platform.channels_by_owner (
 *      owner TEXT,
 *      id TEXT,
 *      name TEXT,
 *      PRIMARY KEY (owner, id)
 *  );
 */

app.put('/channels', async (req, res) => {
    const { id, name, owner } = req.body;

    try {
        // Check if the channel already exists
        const checkQuery = 'SELECT id FROM channels WHERE id = ?';
        const checkResult = await cassandraClient.execute(checkQuery, [id], { prepare: true });

        if (checkResult.rowLength > 0) {
            return res.status(409).json({ error: 'Channel with this ID already exists' });
        }

        // Insert into `channels` table
        const insertQuery = 'INSERT INTO channels (id, name, owner) VALUES (?, ?, ?)';
        await cassandraClient.execute(insertQuery, [id, name, owner], { prepare: true });

        // Insert into additional `channels_by_owner` table
        const insertOwnerQuery = 'INSERT INTO channels_by_owner (owner, id, name) VALUES (?, ?, ?)';
        await cassandraClient.execute(insertOwnerQuery, [owner, id, name], { prepare: true });

        res.status(201).json({ id });
    } catch (error) {
        console.error('Error registering channel:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/channels', async (req, res) => {
    const owner = req.query.owner;

    // Validate query parameter
    if (owner && typeof owner !== 'string') {
        return res.status(400).json({ error: 'Invalid parameter - owner must be a string or not provided' });
    }

    try {
        let query = 'SELECT * FROM channels';
        let params = [];

        if (owner) {
            query = 'SELECT * FROM channels_by_owner WHERE owner = ?';
            params.push(owner);
        }

        const result = await cassandraClient.execute(query, params, { prepare: true });

        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const channels = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            owner: row.owner
        }));

        res.status(200).json(channels);
    } catch (error) {
        console.error('Error retrieving channels:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/channels/:channelId', async (req, res) => {
    const channelId = req.params.channelId;

    try {
        const query = 'SELECT * FROM channels WHERE id = ?';
        const params = [channelId];

        const result = await cassandraClient.execute(query, params, { prepare: true });

        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const channel = {
            id: result.rows[0].id,
            name: result.rows[0].name,
            owner: result.rows[0].owner
        };

        res.status(200).json(channel);
    } catch (error) {
        console.error('Error retrieving channel:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/channels/:channelId', async (req, res) => {
    const channelId = req.params.channelId;

    try {
        // First, check if the channel exists
        const checkChannelQuery = 'SELECT * FROM channels WHERE id = ?';
        const checkResult = await cassandraClient.execute(checkChannelQuery, [channelId], { prepare: true });

        if (checkResult.rowLength === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const channelOwner = checkResult.rows[0].owner; // Store the owner for later use

        // First delete all videos in the channel and their views
        const videosQuery = 'SELECT id FROM videos WHERE channel_id = ?';
        const videosResult = await cassandraClient.execute(videosQuery, [channelId], { prepare: true });

        if (videosResult.rowLength > 0) {
            for (const video of videosResult.rows) {
                // Delete views for each video
                await cassandraClient.execute('DELETE FROM video_views WHERE channel_id = ? AND video_id = ?', [channelId, video.id], { prepare: true });
            }

            // Delete videos from the videos table
            await cassandraClient.execute('DELETE FROM videos WHERE channel_id = ?', [channelId], { prepare: true });
        }

        // Now delete the channel from channels table
        await cassandraClient.execute('DELETE FROM channels WHERE id = ?', [channelId], { prepare: true });

        // Delete the channel from channels_by_owner table
        await cassandraClient.execute('DELETE FROM channels_by_owner WHERE owner = ? AND id = ?', [channelOwner, channelId], { prepare: true });

        res.status(204).send(); // No content, channel deleted
    } catch (error) {
        console.error('Error deleting channel:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/*
 *  CREATE TABLE IF NOT EXISTS video_platform.videos (
 *      channel_id TEXT,
 *      id TEXT,
 *      title TEXT,
 *      description TEXT,
 *      duration INT,
 *      PRIMARY KEY (channel_id, id)
 *  );
 */

/*
 *  CREATE TABLE IF NOT EXISTS video_platform.videos_by_channel (
 *      channel_id TEXT,
 *      id TEXT,
 *      title TEXT,
 *      description TEXT,
 *      duration INT,
 *      PRIMARY KEY (channel_id, duration, id)
 *  );
 */

app.put('/channels/:channelId/videos', async (req, res) => {
    const channelId = req.params.channelId;
    const { id, title, description, duration } = req.body;

    // Validate the video input
    if (!id || 
        !title || typeof title !== 'string' || 
        !description || typeof description !== 'string' || 
        !Number.isInteger(duration) || duration <= 0) {
        return res.status(400).json({ error: 'Invalid video data - ensure all fields are valid' });
    }

    try {
        // Check if the channel exists
        const checkChannelQuery = 'SELECT * FROM channels WHERE id = ?';
        const checkResult = await cassandraClient.execute(checkChannelQuery, [channelId], { prepare: true });

        if (checkResult.rowLength === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        // Check if the video ID already exists
        const checkVideoQuery = 'SELECT * FROM videos WHERE id = ? AND channel_id = ?';
        const checkVideoResult = await cassandraClient.execute(checkVideoQuery, [id, channelId], { prepare: true });

        if (checkVideoResult.rowLength > 0) {
            return res.status(409).json({ error: 'Video with this ID already exists in the channel' });
        }

        // Insert the video data into the `videos` and `videos_by_channel` tables
        const videoQueries = [
            {
                query: 'INSERT INTO videos (id, title, description, duration, channel_id) VALUES (?, ?, ?, ?, ?)',
                params: [id, title, description, duration, channelId]
            },
            {
                query: 'INSERT INTO videos_by_channel (channel_id, id, title, description, duration) VALUES (?, ?, ?, ?, ?)',
                params: [channelId, id, title, description, duration]
            }
        ];

        await cassandraClient.batch(videoQueries, { prepare: true });

        // Initialize the view count in the `video_views` table
        const viewCountQuery = 'UPDATE video_views SET views = views + 0 WHERE channel_id = ? AND video_id = ?';
        await cassandraClient.execute(viewCountQuery, [channelId, id], { prepare: true });

        res.status(201).json({ id });
    } catch (error) {
        console.error('Error adding video:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/channels/:channelId/videos', async (req, res) => {
    const channelId = req.params.channelId;
    const minDuration = parseInt(req.query.minDuration, 10);

    if (req.query.minDuration && (isNaN(minDuration) || minDuration < 0)) {
        return res.status(400).json({ error: 'Invalid parameter - minDuration must be a positive integer or not provided' });
    }

    try {
        let query, params;

        // Use `videos_by_channel` table when `minDuration` is specified
        if (minDuration) {
            query = 'SELECT id, title, description, duration FROM videos_by_channel WHERE channel_id = ? AND duration >= ?';
            params = [channelId, minDuration];
        } else {
            // Use `videos` table to list all videos without filtering
            query = 'SELECT id, title, description, duration FROM videos WHERE channel_id = ?';
            params = [channelId];
        }

        const result = await cassandraClient.execute(query, params, { prepare: true });

        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'No videos found for the specified channel' });
        }

        const videos = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description,
            duration: row.duration
        }));

        res.status(200).json(videos);
    } catch (error) {
        console.error('Error retrieving videos:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/channels/:channelId/videos/:videoId', async (req, res) => {
    const { channelId, videoId } = req.params;

    try {
        // Query to fetch the video by both channelId and videoId
        const query = 'SELECT id, title, description, duration FROM videos WHERE channel_id = ? AND id = ?';
        const params = [channelId, videoId];

        const result = await cassandraClient.execute(query, params, { prepare: true });

        // Check if the video exists
        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // Extract video details from the result
        const video = result.rows[0];

        res.status(200).json({
            id: video.id,
            title: video.title,
            description: video.description,
            duration: video.duration,
        });
    } catch (error) {
        console.error('Error retrieving video:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/channels/:channelId/videos/:videoId', async (req, res) => {
    const { channelId, videoId } = req.params;

    try {
        // Check if the video exists
        const checkQuery = 'SELECT id FROM videos WHERE channel_id = ? AND id = ?';
        const checkParams = [channelId, videoId];
        const checkResult = await cassandraClient.execute(checkQuery, checkParams, { prepare: true });

        if (checkResult.rowLength === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // First delete the views for the video
        const deleteViewsQuery = 'DELETE FROM video_views WHERE channel_id = ? AND video_id = ?';
        await cassandraClient.execute(deleteViewsQuery, [channelId, videoId], { prepare: true });

        // Then delete the video from the videos table
        const deleteQuery = 'DELETE FROM videos WHERE channel_id = ? AND id = ?';
        await cassandraClient.execute(deleteQuery, checkParams, { prepare: true });

        res.status(204).send({ message: 'Video deleted' });
    } catch (error) {
        console.error('Error deleting video:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/*
 *  CREATE TABLE IF NOT EXISTS video_platform.video_views (
 *      channel_id TEXT,
 *      video_id TEXT,
 *      views COUNTER,
 *      PRIMARY KEY ((channel_id), video_id)
 *  );
 */

app.get('/channels/:channelId/videos/:videoId/views', async (req, res) => {
    const { channelId, videoId } = req.params;

    try {
        // Query to fetch the views for the specified video
        const query = 'SELECT views FROM video_platform.video_views WHERE channel_id = ? AND video_id = ?';
        const params = [channelId, videoId];
        
        const result = await cassandraClient.execute(query, params, { prepare: true });

        // Check if the video has views recorded
        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // Extract views from the result
        const views = result.rows[0].views || 0; // Default to 0 if views are null

        res.status(200).json({ views });
    } catch (error) {
        console.error('Error retrieving video views:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/channels/:channelId/videos/:videoId/views/register', async (req, res) => {
    const { channelId, videoId } = req.params;

    try {
        // Check if the video exists
        const checkVideoQuery = 'SELECT * FROM videos WHERE id = ? AND channel_id = ?';
        const videoExists = await cassandraClient.execute(checkVideoQuery, [videoId, channelId], { prepare: true });

        if (videoExists.rowLength === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // Increment the view count for the video in the `video_views` table
        const incrementViewQuery = 'UPDATE video_views SET views = views + 1 WHERE channel_id = ? AND video_id = ?';
        await cassandraClient.execute(incrementViewQuery, [channelId, videoId], { prepare: true });

        // Return a 204 response indicating that the view was registered successfully
        res.status(204).send();
    } catch (error) {
        console.error('Error registering view:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/flushall', async (req, res) => {
    try {
        // Truncate all relevant tables
        await cassandraClient.execute('TRUNCATE video_platform.channels', { prepare: true });
        await cassandraClient.execute('TRUNCATE video_platform.channels_by_owner', { prepare: true });
        await cassandraClient.execute('TRUNCATE video_platform.videos', { prepare: true });
        await cassandraClient.execute('TRUNCATE video_platform.videos_by_channel', { prepare: true });
        await cassandraClient.execute('TRUNCATE video_platform.video_views', { prepare: true });

        res.status(204).send(); // No content, flush successful
    } catch (error) {
        console.error('Error flushing the database:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
app.listen(8080, async () => {
    await cassandraClient.connect();
    console.log('Connected to Cassandra');
});
