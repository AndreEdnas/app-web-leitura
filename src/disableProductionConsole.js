if (process.env.NODE_ENV === "production" && typeof console !== "undefined") {
  const noop = () => {};

  ["log", "info", "debug", "warn", "error"].forEach((method) => {
    try {
      console[method] = noop;
    } catch {
      // Algumas implementações do browser podem expor a consola como read-only.
    }
  });
}

