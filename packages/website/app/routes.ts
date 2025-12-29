import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect.tsx"),
  route("api/theme", "routes/api.theme.ts"),
  route("sitemap.xml", "routes/sitemap[.]xml.tsx"),
  layout("routes/language-layout.tsx", [
    route(":lang", "routes/index.tsx", [
      index("routes/home.tsx"),
      route("entry/:slug", "routes/entry.$slug.tsx"),
    ])
  ])
] satisfies RouteConfig;
