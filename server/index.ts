import { createApp } from "./app";
import { config } from "./config";
const runtime = createApp();
const server = runtime.app.listen(config.port, () =>
  console.log(`Outpost Rivals API on :${config.port}`),
);
runtime.store.check().then((s) => console.log("Checkout:", s.reason));
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      runtime.close();
      process.exit(0);
    }),
  );
