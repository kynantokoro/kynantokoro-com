// Ambient augmentation of the Worker `Env` with secrets that are configured in
// the Cloudflare dashboard (not declared in wrangler.jsonc). `wrangler types`
// regenerates `worker-configuration.d.ts` with an empty `Cloudflare.Env` in a
// clean environment (e.g. CI), which would drop these bindings. Declaring them
// here merges into `Cloudflare.Env` so they stay typed everywhere.
declare namespace Cloudflare {
  interface Env {
    SANITY_PROJECT_ID: string;
    SANITY_DATASET: string;
    SANITY_PERSPECTIVE: string;
    SANITY_TOKEN: string;
    ANTHROPIC_API_KEY: string;
  }
}
