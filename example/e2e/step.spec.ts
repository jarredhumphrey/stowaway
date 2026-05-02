import { describe, it, expect } from "stowaway";
import type { AppSession } from "stowaway";

describe("app.step", () => {
  it("named steps run sequentially and pass", async (app: AppSession) => {
    await app.step("increment twice", async () => {
      const btn = await app.find({ testID: "btn-increment" });
      await btn.tap();
      await btn.tap();
    });

    await app.step("verify counter", async () => {
      const value = await app.find({ testID: "counter-value" });
      expect(await value.text()).toBe("2");
    });
  });

  it("step name prefixes the failure message (intentional demo)", async (app: AppSession) => {
    await app.step("this step will fail", async () => {
      const value = await app.find({ testID: "counter-value" });
      expect(await value.text()).toBe("999");
    });
  });
});
