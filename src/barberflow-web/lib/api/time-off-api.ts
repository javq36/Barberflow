import { baseApi } from "@/lib/api/base-api";

export type TimeOffItem = {
  id: string;
  barberId: string;
  startDate: string;
  endDate: string;
  reason?: string;
};

export type GetTimeOffParams = {
  barberId: string;
  from?: string;
  to?: string;
};

export type CreateTimeOffRequest = {
  barberId: string;
  startDate: string;
  endDate: string;
  reason?: string;
};

export type DeleteTimeOffParams = {
  barberId: string;
  id: string;
};

export const timeOffApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTimeOff: builder.query<TimeOffItem[], GetTimeOffParams>({
      query: ({ barberId, from, to }) => {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const qs = params.toString();
        return {
          url: `/barbers/${barberId}/time-off${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      transformResponse: (response: { data: TimeOffItem[] } | TimeOffItem[]) => {
        if (Array.isArray(response)) return response;
        return response.data;
      },
      providesTags: (_result, _error, arg) => [
        { type: "TimeOff", id: "LIST" },
        { type: "TimeOff", id: arg.barberId },
      ],
    }),
    createTimeOff: builder.mutation<TimeOffItem, CreateTimeOffRequest>({
      query: ({ barberId, ...body }) => ({
        url: `/barbers/${barberId}/time-off`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "TimeOff", id: "LIST" },
        { type: "TimeOff", id: arg.barberId },
      ],
    }),
    deleteTimeOff: builder.mutation<void, DeleteTimeOffParams>({
      query: ({ barberId, id }) => ({
        url: `/barbers/${barberId}/time-off/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "TimeOff", id: "LIST" },
        { type: "TimeOff", id: arg.barberId },
      ],
    }),
  }),
});

export const {
  useGetTimeOffQuery,
  useCreateTimeOffMutation,
  useDeleteTimeOffMutation,
} = timeOffApi;
