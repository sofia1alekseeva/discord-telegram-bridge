#!/bin/bash
docker-compose down
docker container prune -f
docker image prune -f
docker network prune -f
docker volume prune -f
docker system prune -a -f
echo "Docker cleaned up!"