// Small persisted state for the NEAR pollers: a JSON file on disk, or memory in tests.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StateStore<T> {
  load(): T;
  save(state: T): void;
}

export class JsonFileState<T> implements StateStore<T> {
  constructor(
    private file: string,
    private initial: () => T,
  ) {}

  load(): T {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as T) : this.initial();
  }

  save(state: T) {
    mkdirSync(dirname(this.file), { recursive: true });
    // Write-then-rename: a crash mid-write never leaves a half file that resets the cursor.
    writeFileSync(`${this.file}.tmp`, JSON.stringify(state, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }
}

export class MemoryState<T> implements StateStore<T> {
  constructor(public value: T) {}
  load() {
    return structuredClone(this.value);
  }
  save(state: T) {
    this.value = structuredClone(state);
  }
}
