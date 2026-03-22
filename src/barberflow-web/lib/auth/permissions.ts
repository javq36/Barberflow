export type AppRole =
  | "SuperAdmin"
  | "Owner"
  | "Barber"
  | "Customer"
  | "Unknown"
  | null;

export type AppPermission =
  | "admin.access"
  | "barbershop.create"
  | "barbershop.view"
  | "barbershop.edit"
  | "services.view"
  | "services.manage"
  | "barbers.view"
  | "barbers.manage"
  | "customers.view"
  | "customers.manage"
  | "appointments.view"
  | "appointments.manage"
  | "settings.manage"
  | "platform.manage";

const rolePermissions: Record<Exclude<AppRole, null>, AppPermission[]> = {
  SuperAdmin: [
    "admin.access",
    "barbershop.view",
    "barbershop.edit",
    "services.view",
    "services.manage",
    "barbers.view",
    "barbers.manage",
    "customers.view",
    "customers.manage",
    "appointments.view",
    "appointments.manage",
    "platform.manage",
  ],
  Owner: [
    "admin.access",
    "barbershop.create",
    "barbershop.view",
    "barbershop.edit",
    "services.view",
    "services.manage",
    "barbers.view",
    "barbers.manage",
    "customers.view",
    "customers.manage",
    "appointments.view",
    "appointments.manage",
    "settings.manage",
  ],
  Barber: ["appointments.view"],
  Customer: [],
  Unknown: [],
};

export function hasPermission(role: AppRole, permission: AppPermission) {
  if (!role) {
    return false;
  }

  return rolePermissions[role].includes(permission);
}
