import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./env.js";

const adapter = new PrismaPg({ connectionString: config.databaseUrl });

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma || new PrismaClient({ adapter });

if (config.nodeEnv !== "production") {
  global.__prisma = prisma;
}
