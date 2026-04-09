---
name: breakpoint-preview
description: Preview any website at multiple viewport widths simultaneously. Use when the user wants to check responsive design, test breakpoints, compare mobile vs desktop layouts, or see how their site looks across screen sizes. Launches a multi-viewport preview with proxy, scroll sync, and per-viewport navigation.
---

# Breakpoint Preview

Preview any website at multiple viewport widths side by side. Zero dependencies, works with any framework.

## Quick Start

```bash
npx breakpoint-preview http://localhost:5173
```

This launches a proxy server and opens a preview page showing the site at 375px, 768px, 1024px, and 1440px simultaneously.

## Commands

```bash
# Default breakpoints (375, 768, 1024, 1440)
npx breakpoint-preview <url>

# Custom breakpoints
npx breakpoint-preview <url> --breakpoints 320,768,1024,1920

# Standalone window (no browser chrome)
npx breakpoint-preview <url> --app

# Custom port (default: 8787)
npx breakpoint-preview <url> --port 9000

# Static HTML file
npx breakpoint-preview ./dist/index.html
```

## How It Works

1. A local proxy server starts on port 8787
2. All requests are forwarded to the target dev server
3. HTML responses get a scroll-sync script injected
4. WebSocket connections (HMR) pass through transparently
5. A preview page opens with iframes at each breakpoint width

Because all viewports load through the same-origin proxy, features like scroll sync and URL tracking work across viewports.

## Preview UI

The preview page provides these controls:

- **Per-viewport URL bar**: Inline input in each viewport header. Type a path (e.g. `/about`) and press Enter to navigate that single viewport.
- **Hide/Show**: Click "Hide" to collapse a viewport to a thin vertical strip. Click the strip to restore it. State persists across reloads.
- **Settings popover**: Small dot in the top-right corner. Click to access:
  - **Refresh All**: Reload every viewport
  - **Sync Scroll**: Toggle proportional scroll sync across all viewports
  - **Scale**: Fit all viewports into the browser window
- **Session persistence**: Viewport URLs and hidden states survive page reloads via sessionStorage.

## When to Use

- User asks to "check responsive", "test breakpoints", or "preview mobile"
- User wants to compare how a page looks at different screen widths
- User is debugging a layout issue that only appears at certain viewport sizes
- User wants to see all breakpoints at once without manually resizing the browser

## Framework Support

Works with any dev server: Vite, Next.js, Nuxt, SvelteKit, Astro, Remix, Webpack, or plain HTML files. HMR is preserved through WebSocket proxying.
