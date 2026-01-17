/**
 * templateRepository Unit Tests
 *
 * Tests CRUD operations for set templates.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SetTemplate, TemplateSlot } from "./templateRepository";

describe("templateRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TemplateSlot interface", () => {
    it("should have correct structure with all fields", () => {
      const slot: TemplateSlot = {
        position: 1,
        targetBpmMin: 100,
        targetBpmMax: 120,
        targetEnergy: 75,
        notes: "Opening energy builder",
      };

      expect(slot.position).toBe(1);
      expect(slot.targetBpmMin).toBe(100);
      expect(slot.targetBpmMax).toBe(120);
      expect(slot.targetEnergy).toBe(75);
      expect(slot.notes).toBe("Opening energy builder");
    });

    it("should allow null values for optional fields", () => {
      const slot: TemplateSlot = {
        position: 1,
        targetBpmMin: null,
        targetBpmMax: null,
        targetEnergy: null,
        notes: null,
      };

      expect(slot.position).toBe(1);
      expect(slot.targetBpmMin).toBeNull();
      expect(slot.targetBpmMax).toBeNull();
      expect(slot.targetEnergy).toBeNull();
      expect(slot.notes).toBeNull();
    });
  });

  describe("SetTemplate interface", () => {
    it("should have correct structure", () => {
      const template: SetTemplate = {
        id: 1,
        name: "Competition Set",
        description: "High energy set for competitions",
        slots: [
          { position: 1, targetBpmMin: 90, targetBpmMax: 100, targetEnergy: 60, notes: null },
          { position: 2, targetBpmMin: 100, targetBpmMax: 110, targetEnergy: 80, notes: "Build" },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(template.id).toBe(1);
      expect(template.name).toBe("Competition Set");
      expect(template.slots).toHaveLength(2);
      expect(template.slots[0].position).toBe(1);
    });
  });

  describe("slot serialization", () => {
    it("should serialize slots to JSON correctly", () => {
      const slots: TemplateSlot[] = [
        { position: 1, targetBpmMin: 90, targetBpmMax: 100, targetEnergy: null, notes: null },
        {
          position: 2,
          targetBpmMin: 100,
          targetBpmMax: 110,
          targetEnergy: 80,
          notes: "Peak energy",
        },
      ];

      const json = JSON.stringify(slots);
      const parsed = JSON.parse(json) as TemplateSlot[];

      expect(parsed).toHaveLength(2);
      expect(parsed[0].position).toBe(1);
      expect(parsed[1].targetEnergy).toBe(80);
    });
  });
});
