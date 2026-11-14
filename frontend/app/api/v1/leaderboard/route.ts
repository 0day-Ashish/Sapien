import { fromEngine, preflight } from "@/lib/api";

/** Specialist Agents with Bond, risk-adjusted return and the Vaults they lead. */
export const GET = (request: Request) => fromEngine("/leaderboard", request);
export const OPTIONS = preflight;
