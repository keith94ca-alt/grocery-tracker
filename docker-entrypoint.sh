#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Applying database migrations..."
if ! npx prisma migrate deploy; then
  # Existing database created via `prisma db push` has no migration history.
  # Baseline it by marking all current migrations as already applied, then retry.
  echo "migrate deploy failed — baselining existing database..."
  for dir in prisma/migrations/*/; do
    name="$(basename "$dir")"
    npx prisma migrate resolve --applied "$name" || true
  done
  npx prisma migrate deploy
fi

echo "Starting Next.js application..."
exec npm start
