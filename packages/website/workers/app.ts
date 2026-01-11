import { createRequestHandler } from "react-router";
import translateWorker from "./translate";
import { SHARED_ARRAY_BUFFER_HEADERS } from "../shared-headers";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle translation API endpoint
    if (url.pathname === '/translate') {
      return translateWorker.fetch(request, env);
    }

    const response = await requestHandler(request, {
      cloudflare: { env, ctx },
    });

    // Create new response with all necessary headers
    const newResponse = new Response(response.body, response);

    // Required headers for SharedArrayBuffer support (used by LÖVE.js projects)
    Object.entries(SHARED_ARRAY_BUFFER_HEADERS).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });

    // Add cache headers for HTML responses (only in production mode)
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      // Disable cache for draft mode to show latest unpublished content
      const isDraftMode = env.SANITY_PERSPECTIVE === 'drafts';
      if (isDraftMode) {
        newResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else {
        // SWR cache for production: 60s cache, 1 week stale-while-revalidate
        newResponse.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=604800');
      }
    }

    return newResponse;
  },
} satisfies ExportedHandler<Env>;
