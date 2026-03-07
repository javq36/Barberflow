import { baseApi } from "@/lib/api/base-api";

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
  accessToken: string;
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

export type AuthMeResponse = {
  id: string;
  name: string;
  email: string;
  role: string;
  barbershopId?: string;
};

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    registerOwner: builder.mutation<
      RegisterOwnerResponse,
      RegisterOwnerRequest
    >({
      query: (body) => ({
        url: "/auth/register-owner",
        method: "POST",
        body,
      }),
    }),
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body,
      }),
    }),
    getMe: builder.query<AuthMeResponse, void>({
      query: () => ({
        url: "/auth/me",
        method: "GET",
      }),
    }),
  }),
});

export const { useRegisterOwnerMutation, useLoginMutation, useGetMeQuery } =
  authApi;
