import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface PublicService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  imageUrl?: string;
}

export interface PublicBarber {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface PublicSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface PublicBookingRequest {
  serviceId: string;
  barberId: string;
  slotStart: string;
  customerName: string;
  customerPhone: string;
}

export interface PublicBookingResponse {
  appointmentId: string;
  status: string;
  serviceName: string;
  barberName: string;
  dateTime: string;
  estimatedDuration: number;
}

// ─── Query Arg Types ──────────────────────────────────────────────────────────

interface SlugArg {
  slug: string;
}

interface AvailabilityArg {
  slug: string;
  barberId: string;
  serviceId: string;
  date: string;
}

interface CreateBookingArg {
  slug: string;
  body: PublicBookingRequest;
}

// ─── API Slice ────────────────────────────────────────────────────────────────

export const publicApi = createApi({
  reducerPath: "publicApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/public" }),
  tagTypes: ["PublicServices", "PublicBarbers", "PublicAvailability"],
  endpoints: (builder) => ({
    getPublicServices: builder.query<PublicService[], SlugArg>({
      query: ({ slug }) => `/${slug}/services`,
      providesTags: (_result, _error, { slug }) => [
        { type: "PublicServices", id: slug },
      ],
    }),

    getPublicBarbers: builder.query<PublicBarber[], SlugArg>({
      query: ({ slug }) => `/${slug}/barbers`,
      providesTags: (_result, _error, { slug }) => [
        { type: "PublicBarbers", id: slug },
      ],
    }),

    getPublicAvailability: builder.query<PublicSlot[], AvailabilityArg>({
      query: ({ slug, barberId, serviceId, date }) => ({
        url: `/${slug}/availability`,
        params: { barberId, serviceId, date },
      }),
      providesTags: (_result, _error, { slug, barberId, date }) => [
        { type: "PublicAvailability", id: `${slug}-${barberId}-${date}` },
      ],
    }),

    createPublicBooking: builder.mutation<PublicBookingResponse, CreateBookingArg>({
      query: ({ slug, body }) => ({
        url: `/${slug}/appointments`,
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useGetPublicServicesQuery,
  useGetPublicBarbersQuery,
  useGetPublicAvailabilityQuery,
  useCreatePublicBookingMutation,
} = publicApi;
