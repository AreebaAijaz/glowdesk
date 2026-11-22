# Glowdesk: salon management SaaS for Pakistan

Read this file, `docs/build-brief.md` and `supabase/schema.sql` before writing any code.

## Who you're working with
The founder is a first-time founder with no technical background. Explain things in plain language and keep answers short. Before each step that needs the founder (creating accounts, pasting keys into `.env.local`, running SQL in Supabase, approving a deploy), tell them exactly what to do. Ask when unsure rather than building something broken.

## Current goal: trial MVP
Build a working MVP of the **salon dashboard only** (no marketing website yet). It will be given free to 2–3 salons for a 14-day trial to collect feedback and test whether they'll pay. Build it properly, because the MVP grows into the full product (no throwaway prototype).

- **English only** for now. Urdu comes later if salons ask.
- **Features (Starter plan, build brief section 2.2):** booking calendar (by day, by staff, by service); booking entry by the receptionist with **multiple services per visit** (each item has its own service, staff or "any <level>", time and "booked for" name); clients matched by **phone number** (stored as 92XXXXXXXXXX); a services menu the salon creates itself (category, then variants with price and duration); **deals** (named bundles at a fixed price, searchable at the desk); **staff levels** (Owner, Senior, Middle, Junior; renamable, either named people or a headcount); availability shown as "3 of 5 Juniors free"; walk-ins; a **click-to-send WhatsApp confirmation** using a `https://wa.me/<number>?text=<message>` link that marks the booking as confirmation sent (always optional); and a **daily sales report**.
- **Not now:** automations, AI assistant, multi-branch UI, public self-booking, website, payments integration. Keep the database ready for them (Brand, then Branch, structure from day one).
- **Accounts for trial salons:** the founder creates each salon's login in Supabase Auth. On first login the salon sees a setup screen (salon name), which calls the `create_salon()` SQL function. That function creates the brand, the branch, the owner membership and the default staff levels.

## Stack
- Next.js 15 (App Router, TypeScript), Tailwind CSS 4, lucide-react icons
- Supabase: Postgres, email/password auth, **row-level security** so each salon only sees its own data. Use `@supabase/ssr` plus middleware for the session.
- Hosting later on Vercel (the founder has GitHub, Supabase and Vercel/Cloudflare accounts)
- A draft schema is in `supabase/schema.sql` (tables, `my_branch_ids()`, `create_salon()`, RLS policies). Review it, improve it if needed, and have the founder run it in the Supabase SQL Editor.

## Design
- **Very minimal and simple.** A receptionist with no training should understand it. Big buttons, mobile-first web app, few screens.
- **Light, soft, polite theme. No dark mode.**
- Colours from the Glowdesk pitch video:
  - Peach "Glow" accent: `#E8B8A0` (soft), `#D8A08A` (medium), `#B97A62` (deep, for text or links that need contrast)
  - Charcoal "desk" text: `#2A2523`; muted text `#8A8480`
  - Background: warm off-white `#FBF8F6`; cards white; borders `#EFE7E2`
- Logo: a small sun/ring mark, then "Glow" in peach and "desk" in charcoal. Tagline: "Run your salon, not your notebook."

## Rules
- Never use unofficial WhatsApp automation. Click-to-send links only.
- Don't invent prices or provider fees.
- Use Chrome (Claude in Chrome) to test the app at http://localhost:3000 after each major screen.
- Keep `.env.local` out of git.
