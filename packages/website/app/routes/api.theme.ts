import type { Route } from "./+types/api.theme";

type Theme = 'light' | 'dark' | 'system';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const theme = formData.get('theme') as Theme;
  const prefersDark = formData.get('prefersDark') === 'true';

  if (!['light', 'dark', 'system'].includes(theme)) {
    return new Response('Invalid theme', { status: 400 });
  }

  // Set cookies: theme choice + system preference
  const headers = new Headers();
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  headers.append('Set-Cookie', `theme=${theme}; Path=/; HttpOnly; Max-Age=${maxAge}; SameSite=Lax`);
  headers.append('Set-Cookie', `prefersDark=${prefersDark}; Path=/; HttpOnly; Max-Age=${maxAge}; SameSite=Lax`);

  return new Response(null, {
    status: 200,
    headers,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const themeCookie = cookieHeader.split(';').find(c => c.trim().startsWith('theme='));
  const theme = themeCookie ? themeCookie.split('=')[1] : 'system';

  return Response.json({ theme });
}
