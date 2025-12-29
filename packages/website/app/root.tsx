import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const themeCookie = cookieHeader.split(';').find(c => c.trim().startsWith('theme='));
  const theme = themeCookie ? themeCookie.split('=')[1] as 'light' | 'dark' | 'system' : 'system';

  const prefersDarkCookie = cookieHeader.split(';').find(c => c.trim().startsWith('prefersDark='));
  const prefersDark = prefersDarkCookie ? prefersDarkCookie.split('=')[1] === 'true' : false;

  // Resolve the actual theme to apply
  const resolvedTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

  return { theme, resolvedTheme };
}

export const links: Route.LinksFunction = () => [
  // Favicon
  { rel: "icon", type: "image/png", href: "/favicon-96x96.png", sizes: "96x96" },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "shortcut icon", href: "/favicon.ico" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const theme = data?.theme || 'system';
  const resolvedTheme = data?.resolvedTheme || 'light';

  return (
    <html lang="en" className={resolvedTheme === 'dark' ? 'dark' : ''}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-title" content="Kynan Tokoro" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
