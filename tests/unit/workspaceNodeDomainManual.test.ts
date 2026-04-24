import { describe, expect, it } from "vitest";
import {
  loadWorkspaceDomainManualOrDefault,
  readWorkspaceJsonObject,
  DOMAIN_MANUAL_FILE,
} from "@/lib/workspaceNode";

describe("loadWorkspaceDomainManualOrDefault", () => {
  it("keeps non-empty inline object", async () => {
    const a = { dimension: "x" as const, n: 1 };
    const out = await loadWorkspaceDomainManualOrDefault(a);
    expect(out).toEqual(a);
  });

  it("loads workspace file when explicit is empty", async () => {
    const fromDisk = await readWorkspaceJsonObject(DOMAIN_MANUAL_FILE);
    const out = await loadWorkspaceDomainManualOrDefault({});
    expect(out).toEqual(fromDisk);
  });
});
