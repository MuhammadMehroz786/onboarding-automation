#!/bin/bash
# Database deployment script for Railway

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Database migration complete!"
