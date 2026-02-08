import type { Config } from "@netlify/edge-functions";
import handler from "./auth.ts";

export default handler;

export const config: Config = { path: "/signup" };
