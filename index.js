const express = require('express');
const cassandra = require('cassandra-driver');

const app = express();
const cassandraClient = new cassandra.Client({
    contactPoints: ['localhost'],
    localDataCenter: 'datacenter1',
    keyspace: 'video_platform_keyspace'
});

app.use(express.json());



// Start the server
app.listen(8080, async () => {
    await cassandraClient.connect();
    console.log('Connected to Cassandra');
});
