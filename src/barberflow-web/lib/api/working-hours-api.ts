import { baseApi } from "@/lib/api/base-api";

export type WorkingHourItem = {
  id: string;
  barberId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type UpsertWorkingHourRequest = {
  barberId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type DeleteWorkingHourRequest = {
  barberId: string;
  id: string;
};

export const workingHoursApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkingHours: builder.query<WorkingHourItem[], string>({
      query: (barberId) => ({
        url: `/barbers/${barberId}/working-hours`,
        method: "GET",
      }),
      providesTags: (_result, _error, barberId) => [
        { type: "WorkingHours", id: barberId },
      ],
    }),
    upsertWorkingHour: builder.mutation<WorkingHourItem, UpsertWorkingHourRequest>({
      query: ({ barberId, ...body }) => ({
        url: `/barbers/${barberId}/working-hours`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "WorkingHours", id: arg.barberId },
      ],
    }),
    deleteWorkingHour: builder.mutation<void, DeleteWorkingHourRequest>({
      query: ({ barberId, id }) => ({
        url: `/barbers/${barberId}/working-hours/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "WorkingHours", id: arg.barberId },
      ],
    }),
  }),
});

export const {
  useGetWorkingHoursQuery,
  useUpsertWorkingHourMutation,
  useDeleteWorkingHourMutation,
} = workingHoursApi;
