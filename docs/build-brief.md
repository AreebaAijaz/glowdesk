# Salon SaaS for Pakistan: build brief (condensed)

Condensed from the founder's project plan of 18 Nov 2026. **Current decisions override this brief:** build the dashboard only (no website), English only, as a trial MVP (see CLAUDE.md).

## Product
A subscription web platform for salons and spas in Pakistan. Many salons still keep bookings in notebooks, so they forget appointments, double-book staff, lose client contacts and can't see how the business is doing. Each salon gets a simple dashboard for bookings, clients, services, deals and sales. WhatsApp automations and an AI assistant come later. The founder is non-technical, so the product must be cheap to run and simple to operate.

## Salon dashboard: Starter features (build now)
Principle: very minimal and simple. A receptionist with no training should understand it. Big buttons, mobile-friendly web app (not a native app).

- **Booking calendar** by day, by staff member and by service.
- **Booking entry** by the receptionist only (no public self-booking): client details, service, staff, time.
- **Multiple items per visit.** One client can book several services in one visit, each with its own service, staff level or person, time and "booked for" name. Example: bridal makeup (Senior artist) for her sister plus party makeup (Junior artist) for herself, on one screen, with one combined confirmation message.
- **Client records and history.** Look up the client by **phone number** (not name). Reuse the existing client if found, otherwise create a new one.
- **Click-to-send confirmation.** After saving, a "Send confirmation" button opens `https://wa.me/<92number>?text=<message>`. The receptionist presses Send in WhatsApp, and the app marks the booking "confirmation sent". Free, sent from the salon's own number. Always optional (walk-ins can skip it).
- **Services menu created by each salon** (no fixed catalogue). Categories with variants, each with its own price and duration. Example: Bridal Makeup, then Senior and Junior.
- **Deals.** Named bundles at a fixed price (e.g. "Deal 2: Facial + Haircut"). The receptionist searches "Deal 2", taps it, and its services are added to the booking.
- **Staff by level:** Owner, Senior, Middle, Junior (renamable, more can be added). List people by name, or give a level a headcount (e.g. 15 Juniors). A booking can request a named person or "any Junior". The calendar shows how many people at that level are free at the chosen time.
- **Daily sales report.**
- **Walk-ins.**

## Later (do not build now; keep the database ready)
- **Pro:** full analytics (sales today, this month, vs last month; trending services; top services; new vs returning clients; top spenders; clients not seen in 90+ days; busiest days and hours; average spend). Automations, each with its own on/off switch per salon: confirmation, morning reminder, feedback request after 4–5 days, birthday offers. These go through Meta's official WhatsApp Cloud API, with n8n running shared workflows. Also an AI assistant (Claude API with fixed, safe query tools).
- **Max:** up to 5 branches, each with its own logins, bookings, staff and clients. The owner gets a view of all branches and a branch switcher. Roles: Owner, Branch Manager, Receptionist. Single-branch salons never see branch controls.
- **Ideas:** bridal bookings with advance payment, khata (credit ledger), packages and memberships, daily cash closing, Eid and wedding-season campaigns.

## Plans (assumed prices, not final, PKR per month)
Starter 7,000 (1 branch), Pro 15,000 (1 branch), Max 38,000 (up to 5 branches). 14-day free trial.

## Technical requirements
- Brand, then Branch, structure from day one. Each salon's and branch's data is isolated with Supabase row-level security. Daily backups.
- Phone numbers stored as 92XXXXXXXXXX.
- **Never** use unofficial WhatsApp Web automation (salons' numbers can be banned).
- Payments from salons are manual (JazzCash, Easypaisa, bank) at first. Stripe isn't available in Pakistan.
- Database entities: Brand, Branch, User/Membership (role, branch), Staff Level, Staff Member or headcount, Service Category, Service, Deal, Deal Items, Client, Booking, Booking Items, Payment (on the booking for now), confirmation-sent flag. Later: Subscription/Plan, Feature Settings, Message Log.
