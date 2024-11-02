# no-sql

### Database

Make sure you have Docker Desktop installed:
* [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Usage

```bash
# launch and init empty db
docker compose up -d
```

```bash
# recreate db / cleanup
docker compose down -v && docker-compose up -d
```

```bash
# access the Cassandra CLI from Docker container
docker exec -it cassandra-container cqlsh
```

```bash
# create a new keyspace
CREATE KEYSPACE video_platform WITH REPLICATION = { 'class': 'SimpleStrategy', 'replication_factor': 1 };
```

```bash
# required table creation queries

CREATE TABLE IF NOT EXISTS video_platform.channels (
    id TEXT PRIMARY KEY,
    name TEXT,
    owner TEXT
);

CREATE TABLE IF NOT EXISTS video_platform.channels_by_owner (
    owner TEXT,
    id TEXT,
    name TEXT,
    PRIMARY KEY (owner, id)
);

CREATE TABLE IF NOT EXISTS video_platform.videos (
    channel_id TEXT,
    id TEXT,
    title TEXT,
    description TEXT,
    duration INT,
    PRIMARY KEY (channel_id, id)
);

CREATE TABLE IF NOT EXISTS video_platform.videos_by_channel (
    channel_id TEXT,
    id TEXT,
    title TEXT,
    description TEXT,
    duration INT,
    PRIMARY KEY (channel_id, duration, id)
);

CREATE TABLE IF NOT EXISTS video_platform.video_views (
    channel_id TEXT,
    video_id TEXT,
    views COUNTER,
    PRIMARY KEY ((channel_id), video_id)
);
```
