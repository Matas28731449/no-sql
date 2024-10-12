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
