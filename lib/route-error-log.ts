export const logRouteError = (route: string, error: unknown): void => {
  if (error instanceof Error) {
    console.error(route, { message: error.message, name: error.name });
    return;
  }
  console.error(route, { message: "Unknown error", name: "Error" });
};
