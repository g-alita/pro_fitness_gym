# Cloudflare Pages deployment

This folder is the Pages project root. It contains the static gym website and a Pages Function that proxies `/api/*` requests to the separately deployed Lambda API.

## Configure Pages

- Set the Pages project root directory to `frontend`.
- Use the `None` framework preset, no build command, and `.` as the build output directory.
- In **Settings > Variables and Secrets**, add `BACKEND_API_URL` for Production and Preview. Set it to the API Gateway base URL, including its stage when present, for example `https://example.execute-api.region.amazonaws.com/prod`. Do not append `/api`.
- Keep API secrets on Lambda. The Pages proxy only needs the public API Gateway URL.
- The `_routes.json` file limits Function execution to `/api` requests; static pages and assets are served directly by Pages.

## Deploy with Wrangler

From this directory, authenticate once and deploy:

```powershell
npx wrangler login
npx wrangler pages deploy . --project-name pro-fitness-gym-pages
```

Create the Pages project with the same name if it does not exist. You can also connect the repository to Pages with the settings above; Pages detects the `functions/` directory.

The generated `../frontend-cloudflare.zip` contains the static assets and Function source, but dashboard drag-and-drop does not compile a `functions/` directory. Deploy the `frontend/` directory with Wrangler (or use Git integration) so the `/api/*` proxy is active.

The site redirects `/` to `gym.html`. Its API requests stay same-origin through the Pages Function, preserving the Lambda session cookie without browser CORS configuration. Configure Lambda environment variables as described in `../backend/LAMBDA.md`.
