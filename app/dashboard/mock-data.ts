export type TicketStatus =
  | "open"
  | "in_progress"
  | "awaiting_tenant"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type MockTicket = {
  id: string;
  title: string;
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  createdAt: string;
  updatedAt: string;
  description: string;
};

export const mockTickets: MockTicket[] = [
  {
    id: "TCK-1042",
    title: "Water leak under kitchen sink",
    propertyName: "Oakridge Manor",
    unitLabel: "Unit 2B",
    tenantName: "Jamie Lee",
    status: "in_progress",
    priority: "high",
    category: "Plumbing",
    createdAt: "2026-09-05T09:15:00.000Z",
    updatedAt: "2026-09-09T14:20:00.000Z",
    description:
      "Cabinet is damp and there is visible water pooling under the sink. Tenant reported a slow leak over the last two days.",
  },
  {
    id: "TCK-1039",
    title: "HVAC not cooling in bedroom",
    propertyName: "Elm Street Homes",
    unitLabel: "Unit 5A",
    tenantName: "Marcus Hill",
    status: "open",
    priority: "urgent",
    category: "HVAC",
    createdAt: "2026-09-08T16:45:00.000Z",
    updatedAt: "2026-09-09T08:10:00.000Z",
    description:
      "Tenant reports temperatures above 82°F and no airflow from the bedroom vent. Issue started this morning.",
  },
  {
    id: "TCK-1038",
    title: "Front door lock sticking",
    propertyName: "Summit Terrace",
    unitLabel: "Unit 12C",
    tenantName: "Nina Patel",
    status: "awaiting_tenant",
    priority: "medium",
    category: "Safety",
    createdAt: "2026-09-02T11:00:00.000Z",
    updatedAt: "2026-09-07T12:30:00.000Z",
    description:
      "Lock requires a firm pull and does not fully engage. Tenant requested a maintenance visit to confirm hardware alignment.",
  },
  {
    id: "TCK-1026",
    title: "Dishwasher draining slowly",
    propertyName: "Cedar Grove",
    unitLabel: "Unit 8D",
    tenantName: "Daniel Ortiz",
    status: "resolved",
    priority: "low",
    category: "Appliance",
    createdAt: "2026-08-27T13:30:00.000Z",
    updatedAt: "2026-09-01T15:00:00.000Z",
    description:
      "Dishwasher is not draining properly and leaves standing water after the cycle. Service vendor cleaned the drain hose.",
  },
  {
    id: "TCK-1018",
    title: "Broken hallway light fixture",
    propertyName: "Willow Court",
    unitLabel: "Common Area",
    tenantName: "Portfolio",
    status: "closed",
    priority: "medium",
    category: "Electrical",
    createdAt: "2026-08-16T07:00:00.000Z",
    updatedAt: "2026-08-21T09:00:00.000Z",
    description:
      "Hallway fixture in the north stairwell was flickering and burned out. Replaced with LED fixture after inspection.",
  },
];

export const ticketStatusOptions = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "awaiting_tenant", label: "Awaiting Tenant" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

export const statusStyles: Record<TicketStatus, string> = {
  open: "bg-rose-100 text-rose-700 ring-rose-200",
  in_progress: "bg-amber-100 text-amber-700 ring-amber-200",
  awaiting_tenant: "bg-sky-100 text-sky-700 ring-sky-200",
  resolved: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-200 text-slate-700 ring-slate-300",
};

export const priorityStyles: Record<TicketPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};
