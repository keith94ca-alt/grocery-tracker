#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Syncing database schema..."
npx prisma db push

echo "Starting Next.js application..."
exec npm start
