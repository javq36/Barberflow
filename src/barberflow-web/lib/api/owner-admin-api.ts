import { baseApi } from "@/lib/api/base-api";

export type ServiceItem = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  active: boolean;
};

export type BarberItem = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
};

export type CustomerItem = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
};

export type AppointmentItem = {
  id: string;
  barberId: string;
  serviceId: string;
  customerId: string;
  appointmentTime: string;
  endTime: string;
  status: number;
  notes?: string;
  barberName: string;
  customerName: string;
  serviceName: string;
};

export type CreateAppointmentRequest = {
  barberId: string;
  serviceId: string;
  customerId: string;
  appointmentTime: string;
  notes?: string;
};

export type UpdateAppointmentStatusRequest = {
  id: string;
  status: number;
  notes?: string;
};

export type RescheduleAppointmentRequest = {
  id: string;
  appointmentTime: string;
  barberId?: string;
  serviceId?: string;
  notes?: string;
};

export type CancelAppointmentRequest = {
  id: string;
  notes?: string;
};

export type CreateServiceRequest = {
  name: string;
  durationMinutes: number;
  price: number;
  active: boolean;
};

export type CreateBarberRequest = {
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
};

export type CreateCustomerRequest = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive: boolean;
};

export type UpdateServiceRequest = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  active: boolean;
};

export type UpdateBarberRequest = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
};

export type UpdateCustomerRequest = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive: boolean;
};

export type CreateBarbershopRequest = {
  name: string;
  phone?: string;
  address?: string;
  timezone?: string;
};

export type CreateBarbershopResponse = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  timezone: string;
};

export type BarbershopProfile = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  timezone: string;
  createdAt?: string;
};

export type UpdateBarbershopRequest = {
  name: string;
  phone?: string;
  address?: string;
  timezone?: string;
};

function makeDateRangeQuery() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);

  const to = new Date(now);
  to.setDate(to.getDate() + 30);

  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

export const ownerAdminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createBarbershop: builder.mutation<
      CreateBarbershopResponse,
      CreateBarbershopRequest
    >({
      query: (body) => ({
        url: "/barbershops",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Barbershop", id: "CURRENT" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    getBarbershopProfile: builder.query<BarbershopProfile, void>({
      query: () => ({
        url: "/barbershops/me",
        method: "GET",
      }),
      providesTags: [{ type: "Barbershop", id: "CURRENT" }],
    }),
    updateBarbershopProfile: builder.mutation<
      BarbershopProfile,
      UpdateBarbershopRequest
    >({
      query: (body) => ({
        url: "/barbershops/me",
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "Barbershop", id: "CURRENT" }],
    }),
    getServices: builder.query<ServiceItem[], void>({
      query: () => ({ url: "/services", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              { type: "Services", id: "LIST" },
              ...result.map((service) => ({
                type: "Services" as const,
                id: service.id,
              })),
            ]
          : [{ type: "Services", id: "LIST" }],
    }),
    getBarbers: builder.query<BarberItem[], void>({
      query: () => ({ url: "/barbers", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              { type: "Barbers", id: "LIST" },
              ...result.map((barber) => ({
                type: "Barbers" as const,
                id: barber.id,
              })),
            ]
          : [{ type: "Barbers", id: "LIST" }],
    }),
    getCustomers: builder.query<CustomerItem[], void>({
      query: () => ({ url: "/customers", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              { type: "Customers", id: "LIST" },
              ...result.map((customer) => ({
                type: "Customers" as const,
                id: customer.id,
              })),
            ]
          : [{ type: "Customers", id: "LIST" }],
    }),
    getCustomersSearch: builder.query<CustomerItem[], string>({
      query: (query) => ({
        url: `/customers?query=${encodeURIComponent(query)}`,
        method: "GET",
      }),
    }),
    getAppointments: builder.query<AppointmentItem[], void>({
      query: () => ({
        url: `/appointments?${makeDateRangeQuery()}`,
        method: "GET",
      }),
      providesTags: (result) =>
        result
          ? [
              { type: "Appointments", id: "LIST" },
              ...result.map((appointment) => ({
                type: "Appointments" as const,
                id: appointment.id,
              })),
            ]
          : [{ type: "Appointments", id: "LIST" }],
    }),
    createAppointment: builder.mutation<void, CreateAppointmentRequest>({
      query: (body) => ({
        url: "/appointments",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Appointments", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    updateAppointmentStatus: builder.mutation<
      void,
      UpdateAppointmentStatusRequest
    >({
      query: ({ id, status, notes }) => ({
        url: `/appointments/${id}/status`,
        method: "PATCH",
        body: { status, notes },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Appointments", id: arg.id },
        { type: "Appointments", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    rescheduleAppointment: builder.mutation<void, RescheduleAppointmentRequest>(
      {
        query: ({ id, appointmentTime, barberId, serviceId, notes }) => ({
          url: `/appointments/${id}/reschedule`,
          method: "PATCH",
          body: { appointmentTime, barberId, serviceId, notes },
        }),
        invalidatesTags: (_result, _error, arg) => [
          { type: "Appointments", id: arg.id },
          { type: "Appointments", id: "LIST" },
          { type: "DashboardSummary", id: "CURRENT" },
        ],
      },
    ),
    cancelAppointment: builder.mutation<void, CancelAppointmentRequest>({
      query: ({ id, notes }) => ({
        url: `/appointments/${id}/cancel`,
        method: "PATCH",
        body: { notes },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Appointments", id: arg.id },
        { type: "Appointments", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    createService: builder.mutation<void, CreateServiceRequest>({
      query: (body) => ({
        url: "/services",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Services", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    updateService: builder.mutation<void, UpdateServiceRequest>({
      query: ({ id, ...body }) => ({
        url: `/services/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Services", id: arg.id },
        { type: "Services", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    deleteService: builder.mutation<void, string>({
      query: (id) => ({
        url: `/services/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Services", id },
        { type: "Services", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    createBarber: builder.mutation<void, CreateBarberRequest>({
      query: (body) => ({
        url: "/barbers",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Barbers", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    updateBarber: builder.mutation<void, UpdateBarberRequest>({
      query: ({ id, ...body }) => ({
        url: `/barbers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Barbers", id: arg.id },
        { type: "Barbers", id: "LIST" },
        { type: "Appointments", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    deleteBarber: builder.mutation<void, string>({
      query: (id) => ({
        url: `/barbers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Barbers", id },
        { type: "Barbers", id: "LIST" },
        { type: "Appointments", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    createCustomer: builder.mutation<void, CreateCustomerRequest>({
      query: (body) => ({
        url: "/customers",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Customers", id: "LIST" },
        { type: "DashboardSummary", id: "CURRENT" },
      ],
    }),
    updateCustomer: builder.mutation<void, UpdateCustomerRequest>({
      query: ({ id, ...body }) => ({
        url: `/customers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Customers", id: arg.id },
        { type: "Customers", id: "LIST" },
      ],
    }),
    deleteCustomer: builder.mutation<void, string>({
      query: (id) => ({
        url: `/customers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Customers", id },
        { type: "Customers", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useCreateBarbershopMutation,
  useGetBarbershopProfileQuery,
  useUpdateBarbershopProfileMutation,
  useGetServicesQuery,
  useGetBarbersQuery,
  useGetCustomersQuery,
  useGetCustomersSearchQuery,
  useGetAppointmentsQuery,
  useCreateAppointmentMutation,
  useUpdateAppointmentStatusMutation,
  useRescheduleAppointmentMutation,
  useCancelAppointmentMutation,
  useCreateServiceMutation,
  useUpdateServiceMutation,
  useDeleteServiceMutation,
  useCreateBarberMutation,
  useUpdateBarberMutation,
  useDeleteBarberMutation,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
} = ownerAdminApi;
