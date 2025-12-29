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

    // Add SWR cache headers for HTML responses
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      const newResponse = new Response(response.body, response);
      newResponse.headers.set(
        'Cache-Control',
        'public, s-maxage=60, stale-while-revalidate=3600'
      );
      return newResponse;
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
