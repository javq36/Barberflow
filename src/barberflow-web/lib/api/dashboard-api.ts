import { baseApi } from "@/lib/api/base-api";

type DashboardSummary = {
  apiOk: boolean;
  citasHoy: number;
  barberosActivos: number;
  clientesRegistrados: number;
  serviciosActivos: number;
  proximaCita?: {
    id: string;
    customerName: string;
    serviceName: string;
    appointmentTime: string;
    barberName: string;
  };
};

type Appointment = {
  id: string;
  customerName: string;
  serviceName: string;
  barberName: string;
  appointmentTime: string;
};

type Countable = { active?: boolean; isActive?: boolean };

const isoDate = (date: Date) => date.toISOString();

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardSummary: builder.query<DashboardSummary, void>({
      async queryFn(_arg, _api, _extraOptions, fetchWithBQ) {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);

        const [healthRes, appointmentsRes, barbersRes, customersRes, servicesRes] =
          await Promise.all([
            fetchWithBQ("/health/ready"),
            fetchWithBQ(`/appointments?from=${isoDate(start)}&to=${isoDate(end)}`),
            fetchWithBQ("/barbers"),
            fetchWithBQ("/customers"),
            fetchWithBQ("/services"),
          ]);

        const apiOk = !healthRes.error;
        const appointments = (appointmentsRes.data as Appointment[] | undefined) ?? [];
        const barbers = (barbersRes.data as Countable[] | undefined) ?? [];
        const customers = (customersRes.data as Countable[] | undefined) ?? [];
        const services = (servicesRes.data as Countable[] | undefined) ?? [];

        const serviciosActivos = services.filter((service) => service.active ?? true).length;
        const barberosActivos = barbers.filter((barber) => barber.isActive ?? true).length;

        const sortedAppointments = [...appointments].sort(
          (a, b) => new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime(),
        );

        const proximaCita = sortedAppointments.find(
          (appointment) => new Date(appointment.appointmentTime).getTime() >= now.getTime(),
        );

        return {
          data: {
            apiOk,
            citasHoy: appointments.length,
            barberosActivos,
            clientesRegistrados: customers.length,
            serviciosActivos,
            proximaCita,
          },
        };
      },
      providesTags: ["Dashboard"],
    }),
  }),
});

export const { useGetDashboardSummaryQuery } = dashboardApi;
