# Enforce a hard 5-ticket maximum per person

Today the limit exists only in the Checkout UI, and only for the tickets inside the current basket. A guest can simply order again (or the POS can add more) and end up with 10, 15, 20 tickets. The lifetime badge on Live Bookings shows the real total but does not block anything.

## The rule to enforce

- Maximum **5 tickets per person** for Normal + VIP combined, within the current event season.
- **Parking tickets are excluded** from the count.
- A "person" is identified the same way the lifetime badge already does it: ID number (digits only) first, phone number (last 8 digits) as fallback.
- Counted tickets: all confirmed tickets, plus pending tickets from the last 15 minutes (so a checkout in progress cannot be duplicated in another tab).

## How it will be enforced

Three layers, so the rule cannot be bypassed from any entry point.

**1. Database guard (the real lock)**
A database function counts a person's existing tickets and a trigger on the ticket list rejects any insert that would push them past 5. This holds even if someone calls the backend directly, bypassing the website. It runs inside the same transaction as the insert, so two simultaneous checkouts cannot both slip through.

**2. Checkout pre-check**
Before payment starts, the site asks the backend how many tickets each attendee already has and shows a clear Arabic message naming the person and how many they may still take — instead of failing after the money moves.

**3. POS pre-check**
The same check on the admin point-of-sale screen, shown at the moment an attendee is added, with the remaining allowance displayed next to their name in the customer lookup.

## User-facing behaviour

- Checkout blocks the submit button and explains exactly which attendee exceeded the limit and by how much.
- The customer lookup shows a small badge: "متبقٍ له 2 تذكرة" or "بلغ الحد الأقصى".
- Admins are not silently blocked at the POS by a technical error; they get the same readable message.

## Technical notes

- New database function `get_person_ticket_count(id_number, phone, event_id)` plus a `BEFORE INSERT` trigger on `ticket_holders` that raises a clear error when the limit is exceeded.
- Reuses the existing normalisation logic from `get_lifetime_ticket_totals` so the counts always agree with the badge already shown in Live Bookings.
- Checkout (`src/pages/Checkout.tsx`) and POS (`src/pages/AdminPOS.tsx`) call the new function before creating the order; the existing basket-level check stays as instant feedback.
- No existing data is modified — guests already over the limit keep their tickets, they simply cannot add more.

## Open question

Should the 5-ticket cap reset for each new event season (recommended), or apply to a person's lifetime total across all past events?
