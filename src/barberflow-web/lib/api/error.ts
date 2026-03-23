export function getApiErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const data = "data" in error ? (error as { data: unknown }).data : error;
    // Shape 1: { message: "..." }
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      return (data as { message: string }).message;
    }
    // Shape 2: ProblemDetails { title: "..." }
    if (
      data &&
      typeof data === "object" &&
      "title" in data &&
      typeof (data as { title: unknown }).title === "string"
    ) {
      return (data as { title: string }).title;
    }
    // Shape 3: { error: "..." }
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
    // RTK Query error with status
    if ("status" in (error as object)) {
      const status = (error as { status: unknown }).status;
      if (status === 401) return "Tu sesión expiró. Iniciá sesión de nuevo.";
      if (status === 403) return "No tenés permiso para realizar esta acción.";
      if (status === 429) return "Demasiadas solicitudes. Esperá un momento.";
    }
  }
  if (error instanceof Error) return error.message;
  return "Algo salió mal. Intentá de nuevo.";
}
