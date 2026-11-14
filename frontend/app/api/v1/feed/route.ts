import { fromEngine, preflight } from "@/lib/api";

/** Latest agent decisions, newest first. ?vault=0x…&limit=50 (max 500). */
export const GET = (request: Request) => fromEngine("/feed", request, ["vault", "limit"]);
export const OPTIONS = preflight;
