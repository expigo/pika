/**
 * URL Slug Utilities
 * Converts DJ names and other strings to URL-safe slugs
 */

/**
 * Convert a DJ name to a URL-safe slug
 * Examples:
 *   "DJ Smooth" → "dj-smooth"
 *   "DJ André" → "dj-andre"
 *   "Sarah B." → "sarah-b"
 *   "John   Doe" → "john-doe"
 */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        // Normalize unicode characters (é → e, ñ → n)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        // Replace spaces and underscores with hyphens
        .replace(/[\s_]+/g, "-")
        // Remove non-alphanumeric except hyphens
        .replace(/[^a-z0-9-]/g, "")
        // Collapse multiple hyphens
        .replace(/-+/g, "-")
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, "");
}

/**
 * Reserved slugs that cannot be used as DJ names
 */
export const RESERVED_SLUGS = new Set([
    "admin",
    "api",
    "dj",
    "live",
    "recap",
    "s",
    "session",
    "settings",
    "about",
    "privacy",
    "terms",
    "help",
    "support",
    "login",
    "logout",
    "register",
    "signup",
    "dashboard",
    "profile",
    "account",
    "user",
    "users",
    "event",
    "events",
    "organizer",
    "organizers",
]);

/**
 * Check if a slug is reserved
 */
export function isReservedSlug(slug: string): boolean {
    return RESERVED_SLUGS.has(slug.toLowerCase());
}

/**
 * Validate a DJ name for use as a slug
 * Returns null if valid, or an error message if invalid
 */
export function validateDjSlug(name: string): string | null {
    const slug = slugify(name);

    if (slug.length === 0) {
        return "DJ name cannot be empty";
    }

    if (slug.length < 2) {
        return "DJ name must be at least 2 characters";
    }

    if (slug.length > 32) {
        return "DJ name must be 32 characters or less";
    }

    if (isReservedSlug(slug)) {
        return `"${name}" is a reserved name. Please choose another.`;
    }

    return null;
}
