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
CREATE KEYSPACE video_platform_keyspace WITH REPLICATION = { 'class': 'SimpleStrategy', 'replication_factor': 1 };
```