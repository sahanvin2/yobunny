import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

async function getDatabaseMetrics() {
  const tableNames = await prisma.$queryRawUnsafe(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name"
  );

  const rowCounts = {};
  for (const row of tableNames) {
    const table = row.table_name;
    const result = await prisma.$queryRawUnsafe(`select count(*)::bigint as count from \"${table}\"`);
    rowCounts[table] = Number(result[0].count);
  }

  const [{ name: dbName }] = await prisma.$queryRawUnsafe("select current_database() as name");
  const [dbSize] = await prisma.$queryRawUnsafe(
    `select pg_database_size('${dbName}') as bytes, pg_size_pretty(pg_database_size('${dbName}')) as pretty`
  );

  const tableSizes = await prisma.$queryRawUnsafe(
    "select relname as table_name, pg_total_relation_size(relid) as bytes from pg_catalog.pg_statio_user_tables order by bytes desc"
  );

  const rowEstimates = await prisma.$queryRawUnsafe(
    "select relname as table_name, n_live_tup::bigint as estimated_rows from pg_stat_user_tables order by n_live_tup desc"
  );

  const columnCounts = await prisma.$queryRawUnsafe(
    "select table_name, count(*)::int as columns from information_schema.columns where table_schema='public' group by table_name order by table_name"
  );

  return {
    rowCounts,
    db: {
      name: dbName,
      sizeBytes: Number(dbSize.bytes),
      sizePretty: dbSize.pretty
    },
    tableSizes: tableSizes.map((row) => ({ ...row, bytes: Number(row.bytes) })),
    rowEstimates: rowEstimates.map((row) => ({ ...row, estimated_rows: Number(row.estimated_rows) })),
    columnCounts
  };
}

async function getB2Metrics() {
  if (!process.env.B2_BUCKET || !process.env.B2_ENDPOINT || !process.env.B2_REGION || !process.env.B2_ACCESS_KEY_ID || !process.env.B2_SECRET_ACCESS_KEY) {
    return { configured: false };
  }

  const client = new S3Client({
    region: process.env.B2_REGION,
    endpoint: process.env.B2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY_ID,
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY
    }
  });

  let continuationToken = undefined;
  let totalObjects = 0;
  let totalBytes = 0;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.B2_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      })
    );

    const objects = response.Contents || [];
    totalObjects += objects.length;
    for (const object of objects) {
      totalBytes += Number(object.Size || 0);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return {
    configured: true,
    bucket: process.env.B2_BUCKET,
    totalObjects,
    totalBytes
  };
}

async function main() {
  const [dbMetrics, b2Metrics] = await Promise.all([getDatabaseMetrics(), getB2Metrics()]);
  console.log(JSON.stringify({ dbMetrics, b2Metrics }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
