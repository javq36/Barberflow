import { baseApi } from "@/lib/api/base-api";

export type BookingRulesItem = {
  id: string;
  barbershopId: string;
  slotDurationMinutes: number;
  maxDaysInAdvance: number;
  minNoticeHours: number;
  bufferMinutes: number;
};

export type UpdateBookingRulesRequest = {
  slotDurationMinutes: number;
  maxDaysInAdvance: number;
  minNoticeHours: number;
  bufferMinutes: number;
};

export const bookingRulesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getBookingRules: builder.query<BookingRulesItem, void>({
      query: () => ({
        url: "/barbershops/me/booking-rules",
        method: "GET",
      }),
      providesTags: [{ type: "BookingRules", id: "ME" }],
    }),
    updateBookingRules: builder.mutation<BookingRulesItem, UpdateBookingRulesRequest>({
      query: (body) => ({
        url: "/barbershops/me/booking-rules",
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "BookingRules", id: "ME" }],
    }),
  }),
});

export const { useGetBookingRulesQuery, useUpdateBookingRulesMutation } =
  bookingRulesApi;
