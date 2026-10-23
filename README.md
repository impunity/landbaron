This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Assignment Emails

Ticket assignments send an email through [Resend](https://resend.com). Add these environment variables in Vercel before deploying:

```bash
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="Landbaron <notifications@landbaron.app>"
RESEND_REPLY_TO_EMAIL=scrosby@gmail.com
```

The `landbaron.app` sender domain must be verified in Resend. When configured, filing a ticket sends the tenant a confirmation and emails the assigned staff member with its title, priority, property address, requester email, and a direct ticket link. Reassigning a ticket also emails the new assignee.

## Tenant Ticket Access

Run [supabase/ticket-ownership.sql](supabase/ticket-ownership.sql) once in the Supabase SQL Editor before deploying tenant access control. It records the authenticated creator of each new ticket so tenants can create tickets and view only tickets they created. Existing tickets without a `created_by` value remain available to staff and owners but are not visible to tenants.

## Ticket Submission and Reading Recommendations

Both tenant and staff submission forms require a **Summary** above the description, with a 255-character limit and remaining-character countdown. The trimmed Summary is saved as the ticket title and is not regenerated when the description changes. Existing ticket titles remain unchanged. No database migration is required for this field.

After a successful submission, every role sees a **Thank you!** interstitial with **For your reading consideration...** and a random book from a curated set of historical National Book Award winners. Each recommendation includes its cover thumbnail, title, author, award, an original one-sentence description, and a link to the National Book Foundation's full summary. The catalog is maintained in [lib/reading-recommendations.ts](lib/reading-recommendations.ts); cover thumbnails are requested from Open Library by ISBN. No live book lookup is needed to submit a ticket, and a failed cover load is explicitly labeled without preventing continuation.

**Continue to ticket** (or Escape) opens the new ticket. Attachment or notification failures after ticket creation appear as warnings in the interstitial, rather than prompting another submission of a ticket that was already saved.

## Ticket Conversations and Leaderboard

After the existing ticket ownership, organization, and archiving migrations, run [supabase/ticket-conversations-and-resolvers.sql](supabase/ticket-conversations-and-resolvers.sql) in the Supabase SQL Editor before deploying.

If you already ran an earlier version but see a missing `parent_id` or author-column error, rerun the updated script. It also upgrades legacy `ticket_messages` tables that used `sender_type`, preserving message bodies, IDs, timestamps, and sender types. Old messages receive a label based on their recorded sender type rather than an invented author identity. The script is safe to rerun and requests a Supabase API schema-cache refresh.

Ticket details now include a threaded conversation for all organization staff and the tenant who created the ticket. Previous Owner Notes (both description-embedded notes and any separate owner-notes field) remain unchanged and appear as retained notes in the conversation. Messages are append-only, can reply to other messages on the same ticket, and remain available on resolved or archived tickets.

All staff and the ticket's tenant can resolve or re-open a ticket, including archived tickets. Re-opening clears its current resolution credit; resolving again credits the new resolver. Re-saving an already resolved status cannot change credit or reset its resolution time. Archiving preserves resolution credit.

The Ticket Leaderboard button appears only on Maintenance Tickets, for every role. Rankings cover the caller's organization, including tenants who resolve their own tickets. Each currently resolved ticket counts once (including archived resolutions), with credit going to the person who clicked Resolve, not the assignee. Percentages use all resolved tickets as the denominator, including historical tickets without known resolvers. Average age measures elapsed days from creation to resolution, shown to one decimal. Ties sort by shorter average age, then name and ID. Dismissed and re-opened tickets do not count. Historical resolver identities are not guessed.

## Tenant Introductions

After [supabase/user-preferences.sql](supabase/user-preferences.sql), run [supabase/tenant-introductions.sql](supabase/tenant-introductions.sql). Tenants can use **Edit my info** on their own portal card to add **30 Words About Me**, limited to both 30 whitespace-separated words and 250 characters. Clearing the field removes the introduction.

Introductions appear on tenant cards in the portal, neighbor directory, staff tenant list/detail, and unit resident cards, even when contact sharing is disabled. A birthday saved in account Settings adds the tenant's zodiac sign to those cards. The server derives the sign from account preferences without sending birthdays to other users. The birthday lookup function is restricted to the service role.

Run focused feature tests with `node --test tests/ticket-community.test.mjs`.

## Platform Admin

Set the server-only `PLATFORM_ADMIN_EMAILS` environment variable to a comma-separated allowlist of platform administrators. Currently, only `scrosby@gmail.com` should have Platform Admin access:

```bash
PLATFORM_ADMIN_EMAILS=scrosby@gmail.com
```

Configure this in Vercel as well as local development, then redeploy/restart. Do not use a `NEXT_PUBLIC_` prefix. Access is checked against the authenticated Supabase user's email on every Platform Admin API request; neither organization owners nor staff records can grant this access. An unset/empty allowlist disables platform access.

Admins land on `/dashboard/platform-admin` after sign-in and have a Platform Admin link in the account bar. This tier is separate from organization roles: existing permissions within an admin's own organization remain unchanged, while platform-wide access is **read-only**. No impersonation or organization switching is performed.

The overview lists every organization, its owner contacts, property/unit totals, tenant records (including inactive records), owners, managers, maintenance staff, contractors, and days since the most recent recorded member login. Every metric column is sortable; organizations with no recorded login show "Never recorded" and sort last. Statistics page through all source rows rather than relying on Supabase's default row limit.

Click an organization to browse its records, discussions, photos, receipts, codes, financial records, handbooks, legal documents, solar integration status, and login history in paginated read-only sections. Private legal files use five-minute signed links. OAuth credentials, access-request tokens, invite codes, and authentication records are not exposed. Missing feature migrations produce an explicit section error rather than an empty success result. The existing organization/feature migrations are required; this feature needs no new database migration.

Run the focused authorization, aggregation, sorting, scoping, and pagination tests with `node --test tests/platform-admin.test.mjs`.

## Properties, Units, Tenants & Maintenance History

Run [supabase/properties-and-units.sql](supabase/properties-and-units.sql) once in the Supabase SQL Editor. It creates tables for:
- `properties`: Physical properties with addresses and notes
- `units`: Rental units with bed/bath/sqft, occupancy status, photos, and monthly rent (visible and editable by owners only)
- `tenants`: Multiple residents per unit with contact info (email, phone, emergency contact) and lease dates
- `unit_photos`: Unit photo gallery and condition records
- `unit_maintenance_notes`: Chronological maintenance history per unit tracking "Completed Work" and "Work to Consider" with cost, technician/vendor, and date.
- Links tickets to units and properties with direct navigation from unit view to ticket queue.

## Property Handbook Photos

Run [supabase/property-handbooks.sql](supabase/property-handbooks.sql) in the Supabase SQL Editor to enable handbook records and public property photo storage. The script is safe to rerun and adds the photo URL column and storage bucket to existing installations.

## Property Photos

Run [supabase/property-photos.sql](supabase/property-photos.sql) in the Supabase SQL Editor to enable the property photo shown on the Properties page. Owners and managers upload it from a property's detail page; it is stored separately from the Property Handbook photo. Until one is uploaded, the Properties page shows a unit photo (a unit's primary photo first) labeled with its unit number.

## Tenant Portal, Contacts & Vendors

Run [supabase/tenant-portal-and-contacts.sql](supabase/tenant-portal-and-contacts.sql) once in Supabase. It adds tenant avatars and improvement photos, per-property primary/secondary staff assignments, and approved vendor records.

Editable initials-only avatars display a `+` photo-upload cue. Use the account avatar's `+` to open profile settings, or click an editable avatar to choose a photo. Tenants can change only their own photo; read-only avatars do not show upload controls.

## Getting Started ##

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
