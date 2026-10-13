# SHOW UP

SHOW UP is an events and organizer platform built with React, Vite and Supabase. Supabase Auth stores password hashes and issues sessions; PostgreSQL stores profiles, approved hosts, events and engagement data. Row-level security policies protect account and organizer data.

## Local setup

1. Create a Supabase project. Keep the project **service-role/secret key** private; it must never be added to a `VITE_` variable or shipped to the browser.
2. Copy `.env.example` to `.env.local`, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the project’s API settings. These browser values use Supabase’s public key and rely on database RLS for authorization.
3. Run `npm ci`, then `npm run dev` for local development.
4. Apply the migrations in `supabase/migrations/` in filename order using the Supabase CLI (`supabase link`, then `supabase db push`) or the SQL Editor. The second migration adds admin-managed event advertising and payment records. Review both migrations against a staging project before production.
5. In Supabase Auth settings, require email confirmation, set the production Site URL and exact redirect URLs, configure SMTP, and set a minimum password length of 12. Add only the production domains and local development origin you actually use.
6. Deploy the admin-only password reset function:

   ```sh
   supabase functions deploy admin-set-password
   supabase secrets set APP_ORIGIN=https://your-production-domain.example
   ```

   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Do not expose or manually copy the service-role key.

7. Create a user through the normal signup flow and confirm its email. Promote the initial administrator from the Supabase SQL Editor by replacing the address:

   ```sql
   update public.profiles p
   set role = 'admin'
   from auth.users u
   where p.id = u.id
     and lower(u.email) = lower('your-admin@example.com');
   ```

8. Add real event and organizer records only after the host/admin review workflow is tested in staging. This migration intentionally contains no fake credentials or fake published events.
9. For a deployment, run `npm run build` after setting the production environment variables, publish the newly generated `dist` directory, and configure the host to rewrite application routes (including `/events/*` and `/organizers/*`) to `index.html`. Never publish an old or hand-copied `dist` directory.

## Deploying to Netlify

1. Create a Netlify site from the repository. The repository-root `netlify.toml` sets the base directory to `my-react-app`, along with the build command, publish directory, Node version, and SPA route fallback.
2. In the Netlify site’s environment variables, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the production Supabase project URL and public anon/publishable key. These values are included in the browser build; never add a Supabase service-role/secret key here.
3. Deploy, then add the assigned Netlify URL (and any custom domain) to Supabase Auth’s Site URL and redirect URL allow-list. Set the Site URL to the primary production URL and allow the exact callback origins used by the app.
4. Configure a production SMTP sender and deploy the `admin-set-password` Supabase Edge Function as described above before enabling real accounts and administrator password resets.

## Deploying to GitHub Pages

1. Push this repository to GitHub on the `main` branch and, in **Settings → Pages**, set the source to **GitHub Actions**.
2. Add the repository Actions secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the production Supabase URL and public anon/publishable key. The deploy workflow fails if either is missing. Never add the Supabase service-role/secret key.
3. Each push to `main` builds and publishes `my-react-app` to GitHub Pages. The workflow sets the project-page base path, supports refreshing event and organizer URLs, and uses the built `404.html` fallback for other app routes.
4. Add the published Pages URL to Supabase Auth’s Site URL and redirect URL allow-list. For project pages, the app URL includes the repository path (for example, `https://owner.github.io/repository/`); use that exact URL for confirmation and password-recovery redirects.
5. GitHub Pages only hosts the frontend. Apply the Supabase migrations, configure production Auth/SMTP settings, and deploy the `admin-set-password` Edge Function separately as described above.

## Data and permissions

- Supabase Auth handles password hashing, email confirmation, sessions and password updates. Password values are never saved in application tables.
- New members cannot assign themselves roles. Hosts apply and must be approved by an admin before they can create events. Admins approve/reject host applications through a database function.
- Organizers can manage their own event content; database triggers prevent them from approving events or featuring them. Event approval and featuring require admin authority.
- Admins can add and publish events directly from the Events tab. Host-submitted events appear publicly as soon as an admin approves them; the normal listing order is upcoming date/time.
- The Advertising tab supports manual confirmation of ad payments already received (no payment provider is integrated). Active sponsored events are labeled and ranked by their total confirmed payments; ties are ordered by event date/time. Promotion expires at event start. Admins can void a mistaken payment with a required reason; the audit record is retained. Public clients receive rank only, not payer identities or payment amounts.
- Deleting an event requires confirmation. Its RSVPs, saves and ratings are deleted, while payment-history rows remain with the event title snapshot.
- Event attendance, saved events, organizer follows and ratings are persisted against authenticated accounts. Rating submission is restricted to a user recorded as having attended a past event.
- Event and organizer metrics expose aggregates, not attendee identity. Admin password resets are performed in a server-side Edge Function, with the service-role key kept in Supabase and the action written to the admin audit log.
- Public contact details entered for an organizer or event are visible to visitors. Collect only details the host intends to publish.

## Current deployment gate

This repository contains the Supabase schema, security policies, authentication client and administrator password-reset function. The local app is connected to Supabase and the platform migrations have been applied, but it is **not yet a complete launch deployment**: Netlify site/domain, production Auth URL configuration, SMTP sender, Edge Function deployment, administrator account, and production verification remain environment-specific and must be configured. Review Supabase Auth rate limits, CAPTCHA/bot protection, backup/PITR, monitoring, retention/privacy terms, image upload limits and recovery email delivery before collecting real user data.
