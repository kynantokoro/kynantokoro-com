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

    // Proxy Sanity's image CDN through our own origin. The whole site is
    // cross-origin isolated (COEP: require-corp) so SharedArrayBuffer works for
    // the LÖVE.js projects — which makes the browser block cross-origin <img>s
    // from cdn.sanity.io: it sends no Cross-Origin-Resource-Policy header, and
    // its CORS allowlist only covers the Studio origin. Re-serving the bytes
    // from our own origin sidesteps the COEP check entirely.
    if (url.pathname.startsWith('/sanity-image/')) {
      const assetPath = url.pathname.slice('/sanity-image/'.length);
      // Only ever proxy Sanity asset paths; the host is locked to cdn.sanity.io.
      if (!/^(images|files)\//.test(assetPath)) {
        return new Response('Not found', { status: 404 });
      }
      const upstream = await fetch(`https://cdn.sanity.io/${assetPath}${url.search}`);
      // Pass the upstream response (incl. its long-lived Cache-Control) through.
      const imageResponse = new Response(upstream.body, upstream);
      // Same-origin already satisfies COEP; set CORP defensively too.
      imageResponse.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      return imageResponse;
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
