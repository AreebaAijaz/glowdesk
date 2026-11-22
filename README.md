# Glowdesk

Salon booking dashboard for Pakistan. Run your salon, not your notebook.

## Run it on your computer
1. Copy `.env.local.example` to `.env.local` and paste your Supabase URL and anon key (Supabase > Project Settings > API).
2. In Supabase > SQL Editor, paste all of `supabase/schema.sql` and press **Run** (once only).
3. In Supabase > Authentication > Users, choose **Add user** and create a login for each salon (tick "Auto confirm").
4. In a terminal inside this folder:
   ```
   npm install
   npm run dev
   ```
5. Open http://localhost:3000 and sign in.

## What's inside
- `src/app/(app)/page.tsx`: calendar (by staff, or a list)
- `src/app/(app)/bookings/new`: new booking (multiple services, deals, staff availability)
- `src/app/(app)/bookings/[id]`: booking details, WhatsApp confirmation, payment
- `src/app/(app)/clients`: clients and their history
- `src/app/(app)/services`: services menu and deals
- `src/app/(app)/staff`: staff levels and people
- `src/app/(app)/sales`: daily sales report
- `supabase/schema.sql`: database tables and security
