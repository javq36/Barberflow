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
    getServices: builder.query<ServiceItem[], void>({
      query: () => ({ url: "/services", method: "GET" }),
      providesTags: ["Dashboard"],
    }),
    getBarbers: builder.query<BarberItem[], void>({
      query: () => ({ url: "/barbers", method: "GET" }),
      providesTags: ["Dashboard"],
    }),
    getCustomers: builder.query<CustomerItem[], void>({
      query: () => ({ url: "/customers", method: "GET" }),
      providesTags: ["Dashboard"],
    }),
    getAppointments: builder.query<AppointmentItem[], void>({
      query: () => ({
        url: `/appointments?${makeDateRangeQuery()}`,
        method: "GET",
      }),
      providesTags: ["Dashboard"],
    }),
    createService: builder.mutation<void, CreateServiceRequest>({
      query: (body) => ({
        url: "/services",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Dashboard"],
    }),
    updateService: builder.mutation<void, UpdateServiceRequest>({
      query: ({ id, ...body }) => ({
        url: `/services/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Dashboard"],
    }),
    deleteService: builder.mutation<void, string>({
      query: (id) => ({
        url: `/services/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Dashboard"],
    }),
    createBarber: builder.mutation<void, CreateBarberRequest>({
      query: (body) => ({
        url: "/barbers",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Dashboard"],
    }),
    updateBarber: builder.mutation<void, UpdateBarberRequest>({
      query: ({ id, ...body }) => ({
        url: `/barbers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Dashboard"],
    }),
    deleteBarber: builder.mutation<void, string>({
      query: (id) => ({
        url: `/barbers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Dashboard"],
    }),
    createCustomer: builder.mutation<void, CreateCustomerRequest>({
      query: (body) => ({
        url: "/customers",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Dashboard"],
    }),
    updateCustomer: builder.mutation<void, UpdateCustomerRequest>({
      query: ({ id, ...body }) => ({
        url: `/customers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Dashboard"],
    }),
    deleteCustomer: builder.mutation<void, string>({
      query: (id) => ({
        url: `/customers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Dashboard"],
    }),
  }),
});

export const {
  useGetServicesQuery,
  useGetBarbersQuery,
  useGetCustomersQuery,
  useGetAppointmentsQuery,
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
