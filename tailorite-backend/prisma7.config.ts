// Prisma ORM 7 configuration (7.10+ reads `prisma7.config.ts`; see docs/DECISIONS.md).
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Same fallback as src/config/env.ts: a linked Clever Cloud PostgreSQL add-on provides
// POSTGRESQL_ADDON_URI; connect to it over TLS (its certificate is self-signed).
if (!process.env.DATABASE_URL?.trim() && process.env.POSTGRESQL_ADDON_URI) {
  const uri = process.env.POSTGRESQL_ADDON_URI;
  process.env.DATABASE_URL = /[?&]sslmode=/.test(uri) ? uri : `${uri}${uri.includes('?') ? '&' : '?'}sslmode=require&uselibpqcompat=true`;
}

const url = process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // `prisma generate` needs no database (Docker and CI builds have no DATABASE_URL); commands that
  // connect, such as `migrate deploy`, still require it.
  ...(url ? { datasource: { url } } : {}),
});
