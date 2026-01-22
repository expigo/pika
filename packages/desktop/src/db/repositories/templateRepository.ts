/**
 * Template Repository
 * CRUD operations for set templates (Phase 2.3)
 */

import { getSqlite } from "../index";

// Slot definition for a template position
export interface TemplateSlot {
  position: number;
  targetBpmMin: number | null;
  targetBpmMax: number | null;
  targetEnergy: number | null;
  notes: string | null;
}

// Full template object
export interface SetTemplate {
  id: number;
  name: string;
  description: string | null;
  slots: TemplateSlot[];
  createdAt: number;
  updatedAt: number;
}

// SQL result row type
interface TemplateRow {
  id: number;
  name: string;
  description: string | null;
  slots: string;
  created_at: number;
  updated_at: number;
}

// Parse raw row into typed template
function parseTemplateRow(row: TemplateRow): SetTemplate {
  let slots: TemplateSlot[] = [];
  try {
    slots = JSON.parse(row.slots);
  } catch {
    console.warn("Failed to parse template slots:", row.slots);
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    slots,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const templateRepository = {
  /**
   * Get all templates sorted by most recently updated
   */
  async getAllTemplates(): Promise<SetTemplate[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TemplateRow[]>(
      `SELECT * FROM set_templates ORDER BY updated_at DESC`,
    );
    return result.map(parseTemplateRow);
  },

  /**
   * Get a single template by ID
   */
  async getTemplateById(id: number): Promise<SetTemplate | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TemplateRow[]>(`SELECT * FROM set_templates WHERE id = ?`, [
      id,
    ]);
    return result[0] ? parseTemplateRow(result[0]) : null;
  },

  /**
   * Create a new template
   */
  async createTemplate(name: string, slots: TemplateSlot[], description?: string): Promise<number> {
    const sqlite = await getSqlite();
    const now = Math.floor(Date.now() / 1000);
    await sqlite.execute(
      `INSERT INTO set_templates (name, description, slots, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [name, description || null, JSON.stringify(slots), now, now],
    );
    // Get the inserted ID
    const result = await sqlite.select<{ id: number }[]>(
      `SELECT id FROM set_templates WHERE rowid = last_insert_rowid()`,
    );
    return result[0]?.id ?? -1;
  },

  /**
   * Update an existing template
   */
  async updateTemplate(
    id: number,
    updates: { name?: string; description?: string | null; slots?: TemplateSlot[] },
  ): Promise<boolean> {
    const sqlite = await getSqlite();
    const existing = await this.getTemplateById(id);
    if (!existing) return false;

    const name = updates.name ?? existing.name;
    const description =
      updates.description !== undefined ? updates.description : existing.description;
    const slots = updates.slots ?? existing.slots;
    const now = Math.floor(Date.now() / 1000);

    await sqlite.execute(
      `UPDATE set_templates 
       SET name = ?, description = ?, slots = ?, updated_at = ?
       WHERE id = ?`,
      [name, description, JSON.stringify(slots), now, id],
    );
    return true;
  },

  /**
   * Delete a template
   */
  async deleteTemplate(id: number): Promise<boolean> {
    try {
      const sqlite = await getSqlite();
      await sqlite.execute(`DELETE FROM set_templates WHERE id = ?`, [id]);
      return true;
    } catch (e) {
      console.error("Failed to delete template:", e);
      return false;
    }
  },

  /**
   * Duplicate a template with a new name
   */
  async duplicateTemplate(id: number, newName: string): Promise<number | null> {
    const existing = await this.getTemplateById(id);
    if (!existing) return null;
    return this.createTemplate(newName, existing.slots, existing.description || undefined);
  },

  /**
   * Create template from current set tracks
   * Takes positions and track data, generates slots with BPM/energy targets
   */
  async createTemplateFromSet(
    name: string,
    tracks: Array<{ position: number; bpm: number | null; energy: number | null; notes?: string }>,
  ): Promise<number> {
    const slots: TemplateSlot[] = tracks.map((t) => ({
      position: t.position,
      // Create a ±5 BPM range around the track's BPM
      targetBpmMin: t.bpm ? Math.round(t.bpm - 5) : null,
      targetBpmMax: t.bpm ? Math.round(t.bpm + 5) : null,
      // Round energy to nearest whole number
      targetEnergy: t.energy ? Math.round(t.energy) : null,
      notes: t.notes || null,
    }));
    return this.createTemplate(name, slots);
  },
};
