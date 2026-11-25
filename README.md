# Zela Boost website

Static site, ready for Vercel. No build step.

## Option A: deploy with the Vercel CLI (about 2 minutes)
1. Install the Vercel CLI once: `npm i -g vercel`  (needs Node.js)
2. Open a terminal in this folder and run: `vercel --prod`
3. Log in when asked, accept the defaults. Vercel prints your live URL.

## Option B: deploy with GitHub (no terminal; future updates redeploy automatically)
1. Create a new repository on github.com and upload everything in this folder (Add file → Upload files).
2. On vercel.com: Add New → Project → Import the repository.
3. Framework preset: **Other**. Build command: none. Output directory: `./` (root). Deploy.

## After the first deploy
- Send one test message through the contact form, then open zelaboost@gmail.com and click **Activate Form** in the FormSubmit email (check Spam).
- Add your domain in Vercel → Project → Settings → Domains.

Pages: `/` (home), `/CaseStudy-*`, `/Service-*`. `vercel.json` turns on clean URLs and long-term caching for `/assets`.
