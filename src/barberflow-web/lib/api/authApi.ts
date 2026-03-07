import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export type RegisterOwnerRequest = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

export type RegisterOwnerResponse = {
  id: string;
  email: string;
  role: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  tokenType: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    barbershopId?: string;
  };
};

export type SessionResponse = {
  authenticated: boolean;
  expiresAtMs: number | null;
};

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/auth",
  }),
  tagTypes: ["AuthSession"],
  endpoints: (builder) => ({
    registerOwner: builder.mutation<
      RegisterOwnerResponse,
      RegisterOwnerRequest
    >({
      query: (body) => ({
        url: "/register-owner",
        method: "POST",
        body,
      }),
    }),
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/login",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AuthSession"],
    }),
    logout: builder.mutation<{ ok: boolean }, void>({
      query: () => ({
        url: "/logout",
        method: "POST",
      }),
      invalidatesTags: ["AuthSession"],
    }),
    getSession: builder.query<SessionResponse, void>({
      query: () => ({
        url: "/session",
        method: "GET",
      }),
      providesTags: ["AuthSession"],
    }),
  }),
});

export const {
  useRegisterOwnerMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetSessionQuery,
} = authApi;
