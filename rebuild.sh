#!/bin/bash

./clean-docker.sh
./recreate_custom_network.sh
docker-compose build --no-cache && docker-compose up -d