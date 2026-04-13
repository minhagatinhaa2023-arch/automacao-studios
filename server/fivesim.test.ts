import { describe, it, expect } from "vitest";

describe("5sim API Key Validation", () => {
  it("should authenticate with 5sim API and get user profile", async () => {
    const apiKey = process.env.FIVESIM_API_KEY;
    expect(apiKey).toBeTruthy();

    const response = await fetch("https://5sim.net/v1/user/profile", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("balance");
    console.log(`5sim profile: id=${data.id}, balance=${data.balance}, rating=${data.rating}`);
  });
});
