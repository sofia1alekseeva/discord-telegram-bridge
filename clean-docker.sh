#!/bin/bash
docker-compose down
yes | docker system prune -a --volumes 
echo "Docker cleaned up!"