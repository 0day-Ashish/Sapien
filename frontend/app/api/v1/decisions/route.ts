import { fromEngine, preflight } from "@/lib/api";

/** Executed decisions with their Decision Commitment hash, newest first. ?vault=0x…&limit=200 or ?hash=0x… */
export const GET = (request: Request) => fromEngine("/decisions", request, ["vault", "limit", "hash"]);
export const OPTIONS = preflight;
