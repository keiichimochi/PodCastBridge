import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration
} from "@remix-run/react";

import globalStyles from "./styles/global.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: globalStyles }
];

export const meta: MetaFunction = () => [
  { charSet: "utf-8" },
  { name: "viewport", content: "width=device-width,initial-scale=1" },
  { title: "US Podcast Trends to Japanese Audio" }
];

export default function App() {
  return (
    <html lang="ja" className="min-h-full bg-slate-950 text-slate-100">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
