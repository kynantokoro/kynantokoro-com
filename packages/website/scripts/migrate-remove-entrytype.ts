import { createClient } from '@sanity/client';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;
const token = process.env.SANITY_TOKEN;

if (!projectId || !dataset || !token) {
  console.error('Set SANITY_PROJECT_ID, SANITY_DATASET and SANITY_TOKEN in the environment.');
  process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion: '2023-05-03', token, useCdn: false });

async function main() {
  // Default 'raw' perspective returns both published and drafts.* ids.
  const ids: string[] = await client.fetch(
    `*[_type == "entry" && (defined(entryType) || defined(week))]._id`
  );
  console.log(`Found ${ids.length} entries with entryType/week to clean.`);
  if (ids.length === 0) return;

  let tx = client.transaction();
  for (const id of ids) {
    tx = tx.patch(id, (p) => p.unset(['entryType', 'week']));
  }
  const res = await tx.commit();
  console.log(`Patched ${res.results?.length ?? 0} documents.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
