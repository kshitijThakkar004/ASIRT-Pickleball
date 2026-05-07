# Asirt Pickleball Open

A Next.js scoring site for your pickleball tournament with:

- public live scoreboard
- live leaderboard updates
- random group generation
- automatic knockout round generation
- Supabase-backed persistence and realtime subscriptions

## Stack

- Next.js App Router
- React 19
- Supabase Auth, Database, and Realtime
- Vercel for deployment

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Create a Supabase project and add:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Run the SQL in [supabase/schema.sql](/Users/kshitijthakkar/Desktop/Asirt Pickleball/supabase/schema.sql).

5. Add at least one admin email to `public.admin_users` in the Supabase table editor.

6. Start the app:

```bash
npm run dev
```

7. Open:

- public board: `http://localhost:3000`
- admin console: `http://localhost:3000/admin`

## Supabase setup

1. Create a new project in Supabase.
2. In `Authentication > Sign In / Providers`, enable Email.
3. In `Authentication > URL Configuration`, add:
   - Site URL: your Vercel domain or `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/admin`
4. In `SQL Editor`, run the schema from [supabase/schema.sql](/Users/kshitijthakkar/Desktop/Asirt Pickleball/supabase/schema.sql).
5. In `Project Settings > API`, copy the Project URL and anon public key into `.env.local` and later into Vercel environment variables.
6. In `Database > Tables > admin_users`, insert the organizer emails allowed to edit scores.
7. In `Database > Replication`, make sure `players`, `tournaments`, `groups`, `group_players`, and `matches` are enabled for realtime.

## Admin workflow

1. Open `/admin`.
2. Create the tournament.
3. Seed the starter roster.
4. Sign in with an allowed admin email using the magic link.
5. Mark the active players for the day.
6. Click `Randomize groups`.
7. Enter scores and toggle `Live on public board` for courts in progress.
8. Once group scores are in, generate quarterfinals, then semifinals, then final stage.

## Free tier notes

Vercel free tier and Supabase free tier are both good enough for this tournament.

- Vercel is fine for a lightweight Next.js frontend with moderate traffic.
- Supabase free tier is enough for a single tournament, realtime score updates, and organizer login.
- Realtime traffic here is small, because the app only syncs a few tables and the data volume is modest.

## Tournament logic

- Group stage uses groups of 4 players.
- Each group plays 3 matches so everyone partners with everyone else once.
- Match scores are entered as team totals to 15.
- Each player receives the exact score their team earned.
- Top 16 qualify by total points.
- Ties use point differential.
- Quarterfinals onward are randomized every round.
