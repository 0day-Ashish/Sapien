import type { EngineEvent } from "./events.js";
import type { Ports } from "./ports.js";

export type Engine = { handle(event: EngineEvent): Promise<void> };

// Empty Execution Engine (ticket #2). The Mandate Check and order pipeline land in #8.
export function createEngine(_ports: Ports): Engine {
  return {
    async handle(_event) {},
  };
}
