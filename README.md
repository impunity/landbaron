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

## Platform Admin

Set the server-only `PLATFORM_ADMIN_EMAILS` environment variable to a comma-separated allowlist of platform administrators. For the initial administrators:

```bash
PLATFORM_ADMIN_EMAILS=scrosby@gmail.com,scrosby@statebeach.com
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
