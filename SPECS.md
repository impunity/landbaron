| status | text | Open, In Progress, Awaiting Tenant, Resolved, Closed, Archived |
# Property Maintenance Ticketing App Specs

## Product Goal
A lightweight maintenance and communication platform for small landlords managing 1–50 rental units. The system should help landlords track properties, units, tenants, maintenance tickets, and internal/external communication in one place while staying easy to operate and ready for Supabase integration.

## Core Entities

### 1. Properties
Represents a physical property owned by the landlord or managed under a portfolio.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| landlord_id | uuid | Optional owner/manager reference if multi-user support is added |
| name | text | Example: "Maple Grove Apartments" |
| address_line_1 | text | Street address |
| address_line_2 | text | Optional |
| city | text | |
| state | text | |
| postal_code | text | |
| country | text | Default "US" |
| status | text | Active, Inactive, Under Renovation |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Auto-updated |

### 2. Units
Represents a specific unit within a property. One property may have multiple units.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| property_id | uuid | Foreign key to `properties.id` |
| unit_number | text | Example: "A-204" |
| bedrooms | integer | |
| bathrooms | numeric | |
| square_feet | integer | Optional |
| rent_amount | numeric | Optional but useful for reporting |
| lease_status | text | Available, Occupied, Vacant |
| status | text | Active, Maintenance, Archived |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 3. Tenants
Represents the resident linked to a given unit.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| unit_id | uuid | Foreign key to `units.id` |
| first_name | text | |
| last_name | text | |
| email | text | Optional |
| phone | text | Optional |
| move_in_date | date | |
| move_out_date | date | Nullable |
| status | text | Active, Pending, Archived |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 4. Tickets
Represents a maintenance request, repair issue, or service task.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| property_id | uuid | Foreign key to `properties.id` |
| unit_id | uuid | Foreign key to `units.id` |
| tenant_id | uuid | Nullable; if issue reported by someone living in unit |
| title | text | Short summary, e.g., "Water leak under sink" |
| description | text | Detailed issue description |
| category | text | Plumbing, Electrical, HVAC, Appliance, Safety, Other |
| priority | text | Low, Medium, High, Urgent |
| status | text | Open, In Progress, Awaiting Tenant, Resolved, Closed |
| source | text | Tenant, Landlord, Vendor, System |
| assigned_to | uuid | Optional vendor or staff user reference |
| opened_at | timestamptz | Default now() |
| updated_at | timestamptz | Auto-updated |
| resolved_at | timestamptz | Nullable |
| created_by | uuid | Optional user ID |

### 5. TicketMessages
Represents communication attached to a ticket, including internal notes and tenant updates.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| ticket_id | uuid | Foreign key to `tickets.id` |
| sender_type | text | Tenant, Landlord, Vendor, System |
| sender_id | uuid | Optional user or tenant ID |
| message | text | Body of the message |
| is_internal_note | boolean | True for landlord-only notes |
| created_at | timestamptz | Default now() |

## Suggested Enum / Check Constraints
For Supabase, use either PostgreSQL enums or a text-based constrained pattern depending on preference.

Recommended values:

- `ticket_status`: `open`, `in_progress`, `awaiting_tenant`, `resolved`, `closed`
- `ticket_priority`: `low`, `medium`, `high`, `urgent`
- `ticket_category`: `plumbing`, `electrical`, `hvac`, `appliance`, `safety`, `general`, `other`
- `property_status`: `active`, `inactive`, `under_renovation`
- `lease_status`: `available`, `occupied`, `vacant`

## Relationships
- One `property` has many `units`
- One `unit` belongs to one `property`
- One `unit` can have many `tenants` over time; current active tenant should be determined by `status`
- One `ticket` belongs to one `property` and one `unit`
- One `ticket` may optionally belong to one `tenant`
- One `ticket` has many `ticket_messages`

## Recommended Supabase Indexes
- `properties(landlord_id)`
- `units(property_id)`
- `tenants(unit_id)`
- `tickets(property_id, status)`
- `tickets(unit_id)`
- `tickets(tenant_id)`
- `ticket_messages(ticket_id, created_at)`

## Row Level Security (RLS)
Recommended policy structure:
- Landlords can read/write their own properties, units, and tickets.
- Tenants can read only their own assigned tickets and related messages.
- Vendors can read assigned tickets and update status as permitted.

## Example SQL Sketch
```sql
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid,
  name text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  status text not null default 'active' check (status in ('active', 'inactive', 'under_renovation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_number text not null,
  bedrooms integer not null default 1,
  bathrooms numeric not null default 1,
  square_feet integer,
  rent_amount numeric,
  lease_status text not null default 'occupied' check (lease_status in ('available', 'occupied', 'vacant')),
  status text not null default 'active' check (status in ('active', 'maintenance', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  move_in_date date,
  move_out_date date,
  status text not null default 'active' check (status in ('active', 'pending', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete restrict,
  tenant_id uuid references public.tenants(id),
  title text not null,
  description text not null,
  category text not null default 'general' check (category in ('plumbing', 'electrical', 'hvac', 'appliance', 'safety', 'general', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'awaiting_tenant', 'resolved', 'closed')),
  source text not null default 'tenant' check (source in ('tenant', 'landlord', 'vendor', 'system')),
  assigned_to uuid,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid,
  constraint ticket_title_not_blank check (length(trim(title)) > 0)
);

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('tenant', 'landlord', 'vendor', 'system')),
  sender_id uuid,
  message text not null,
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now()
);
```

## Operational Notes
- Statuses should be updated via trigger logic or application-level transitions.
- A ticket should remain visible to the property owner even if a tenant is no longer attached.
- Keep `ticket_messages` immutable once created to preserve auditability.
- The app should support future filters like property, priority, overdue tickets, and assigned vendor.

## MVP Scope
For the initial build, focus on:
1. Property and unit management
2. Tenant record storage
3. Ticket creation and lifecycle tracking
4. Message threads for communication
5. Basic dashboard filters and counts

This is intentionally lean and flexible enough to later support vendor scheduling, billing, and maintenance history.
