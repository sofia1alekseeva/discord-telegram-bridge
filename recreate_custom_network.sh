#!/bin/bash

# Название сети
NETWORK_NAME="my_custom_network"

# Удаляем старую сеть, если она существует
docker network rm $NETWORK_NAME 2>/dev/null

# Создаем новую сеть с другим диапазоном IP-адресов
docker network create \
  --subnet=192.168.200.0/24 \
  $NETWORK_NAME

# # Перезапускаем контейнеры
# docker-compose down
# docker-compose up -d
