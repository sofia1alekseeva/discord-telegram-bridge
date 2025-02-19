#!/bin/bash

./recreate_custom_network.sh
docker-compose down && docker-compose build --no-cache && docker-compose up -d