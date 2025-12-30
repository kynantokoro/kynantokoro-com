import { createRequestHandler } from "react-router";
import translateWorker from "./translate";

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

    // Add cache headers for HTML responses (only in production mode)
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      const newResponse = new Response(response.body, response);

      // Disable cache for draft mode to show latest unpublished content
      const isDraftMode = env.SANITY_PERSPECTIVE === 'drafts';
      if (isDraftMode) {
        newResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else {
        // SWR cache for production: 60s cache, 1 week stale-while-revalidate
        newResponse.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=604800');
      }

      return newResponse;
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
