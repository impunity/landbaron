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

## Properties, Units, Tenants & Maintenance History

Run [supabase/properties-and-units.sql](supabase/properties-and-units.sql) once in the Supabase SQL Editor. It creates tables for:
- `properties`: Physical properties with addresses and notes
- `units`: Rental units with bed/bath/sqft, occupancy status, photos, and monthly rent (visible and editable by owners only)
- `tenants`: Multiple residents per unit with contact info (email, phone, emergency contact) and lease dates
- `unit_photos`: Unit photo gallery and condition records
- `unit_maintenance_notes`: Chronological maintenance history per unit tracking "Completed Work" and "Work to Consider" with cost, technician/vendor, and date.
- Links tickets to units and properties with direct navigation from unit view to ticket queue.

## Tenant Portal, Contacts & Vendors

Run [supabase/tenant-portal-and-contacts.sql](supabase/tenant-portal-and-contacts.sql) once in Supabase. It adds tenant avatars and improvement photos, per-property primary/secondary staff assignments, and approved vendor records.

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
