// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fuelFamily, tankHealth } from "./StockList.jsx";

const tank = (over = {}) => ({
  name: "Tank 1",
  fuelType: "Petrol",
  capacity: 20000,
  currentStock: 10000,
  waterCm: 0,
  lastDipAt: "2026-10-13T06:00:00.000Z",
  ...over,
});

describe("fuelFamily", () => {
  it("maps products onto the MS / HSD / CNG chips", () => {
    expect(fuelFamily(tank())).toBe("MS");
    expect(fuelFamily(tank({ fuelType: "Diesel" }))).toBe("HSD");
    expect(fuelFamily(tank({ fuelType: "CNG" }))).toBe("CNG");
    expect(fuelFamily(tank({ fuelType: "Premium Petrol" }))).toBe("MS");
  });
});

describe("tankHealth", () => {
  it("states healthy, low and critical from the level", () => {
    expect(tankHealth(tank()).id).toBe("healthy");
    expect(tankHealth(tank({ currentStock: 4000 })).id).toBe("low");
    expect(tankHealth(tank({ currentStock: 1000 })).id).toBe("critical");
  });

  it("asks for a dip when water is high or no dip is on record", () => {
    expect(tankHealth(tank({ waterCm: 3 })).id).toBe("check");
    expect(tankHealth(tank({ lastDipAt: null })).id).toBe("check");
  });
});
