import type { Route } from "./+types/sitemap[.]xml";

export async function loader({ context }: Route.LoaderArgs) {
  const { createSanityClient, queries } = await import('../lib/sanity');

  const env = (context as any).cloudflare?.env || {};
  const client = createSanityClient(env);

  const baseUrl = 'https://kynantokoro.com';
  const languages = ['en', 'ja'];

  // Static pages
  const staticPages = [''];

  // Fetch all entries (Weekly Project entries + blog posts)
  let entries: { slug: string }[] = [];
  try {
    entries = await client.fetch(queries.allEntries) || [];
  } catch (error) {
    console.error('Error fetching entries for sitemap:', error);
  }

  // Build sitemap XML
  const urls: string[] = [];

  // Add static pages for each language
  for (const lang of languages) {
    for (const page of staticPages) {
      urls.push(`
    <url>
      <loc>${baseUrl}/${lang}${page}</loc>
      <changefreq>weekly</changefreq>
      <priority>1.0</priority>
    </url>`);
    }
  }

  // Add entry pages for each language
  for (const entry of entries) {
    if (entry.slug) {
      for (const lang of languages) {
        urls.push(`
    <url>
      <loc>${baseUrl}/${lang}/entry/${entry.slug}</loc>
      <changefreq>monthly</changefreq>
      <priority>0.8</priority>
    </url>`);
      }
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}
