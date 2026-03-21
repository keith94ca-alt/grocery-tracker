#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Syncing database schema..."
npx prisma db push --accept-data-loss

echo "Running seed / first-boot migration..."
node prisma/seed.js

echo "Starting Next.js application..."
exec npm start
