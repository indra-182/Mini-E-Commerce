import { createApplication } from "./bootstrap.js";
import { loadEnvironment } from "./config/environment.js";

const environment = loadEnvironment();
const { app } = await createApplication({ environment });
await app.listen(environment.port, "0.0.0.0");
