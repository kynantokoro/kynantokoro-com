import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

// Environment variables interface for Cloudflare Workers
export interface SanityEnv {
  SANITY_PERSPECTIVE?: string;
  SANITY_TOKEN?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
}

// Track which mode's startup message has been shown
let shownMode: string | null = null;

// Create a Sanity client with environment-specific configuration
export function createSanityClient(env?: SanityEnv): SanityClient {

  const perspective = (env?.SANITY_PERSPECTIVE || 'published') as 'published' | 'drafts';
  const useCdn = perspective === 'published'; // CDN must be disabled for drafts
  const token = env?.SANITY_TOKEN || undefined; // Token required for drafts

  // Get configuration from env, with fallback for development mode
  // In production (Cloudflare Workers), these come from Secrets via context.cloudflare.env
  // In development, wrangler loads from .env file
  const projectId = env?.SANITY_PROJECT_ID;
  const dataset = env?.SANITY_DATASET;

  if (!projectId || !dataset) {
    throw new Error(
      'SANITY_PROJECT_ID and SANITY_DATASET must be set in environment. ' +
      'In production: configure Cloudflare Secrets. ' +
      'In development: add to .env file and ensure wrangler loads them.'
    );
  }

  // Show startup message once per mode (only show when env is explicitly passed)
  if (env !== undefined && shownMode !== perspective) {
    shownMode = perspective;
    if (perspective === 'drafts') {
      console.log('\n' + '='.repeat(50));
      console.log('🔶 DRAFT MODE - Showing unpublished content');
      console.log('='.repeat(50) + '\n');
    } else {
      console.log('\n' + '='.repeat(50));
      console.log('✅ PUBLISHED MODE - Showing published content');
      console.log('='.repeat(50) + '\n');
    }
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: '2023-05-03',
    useCdn,
    perspective,
    token,
  });
}

// Create image URL builder from a client
export function createUrlFor(sanityClient: SanityClient) {
  const builder = imageUrlBuilder(sanityClient);
  return (source: any) => builder.image(source);
}

// GROQ queries for fetching content
export const queries = {
  // Get all entries (Weekly Project entries + blog posts) sorted by date
  allEntries: `*[_type == "entry"] | order(date desc) {
    _id,
    "slug": slug.current,
    entryType,
    title,
    date,
    emoji,
    tags,
    week,
    enIsTranslated,
    jaIsTranslated,
    "hasEn": defined(content.en) && length(content.en) > 0,
    "hasJa": defined(content.ja) && length(content.ja) > 0
  }`,

  // Get single entry by slug (works for both Weekly Project and blog)
  entryBySlug: `*[_type == "entry" && slug.current == $slug][0] {
    _id,
    "slug": slug.current,
    entryType,
    title,
    date,
    emoji,
    tags,
    content,
    week,
    enIsTranslated,
    jaIsTranslated,
    "hasEn": defined(content.en) && length(content.en) > 0,
    "hasJa": defined(content.ja) && length(content.ja) > 0
  }`,
};
