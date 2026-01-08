import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma 7 requires an adapter to be passed to PrismaClient constructor
const createPrismaClient = () => {
  // Skip Prisma initialization during Next.js build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {} as PrismaClient
  }

  // Create PostgreSQL connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  })

  // Create Prisma adapter
  const adapter = new PrismaPg(pool)

  // Return PrismaClient with adapter
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
