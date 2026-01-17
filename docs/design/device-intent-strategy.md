# Device Intent & Design Strategy

This document outlines the design philosophy for the Pika! Web platform, specifically addressing when to prioritize **Mobile-First** (Dancer/Floor Mode) versus **Desktop-Focused** (DJ/Booth Mode).

## Core Philosophy
Pika! is a multi-modal application. Design decisions must be driven by the **User Context** at the time of interaction. We do not apply a single "Mobile-First" rule to every page; instead, we group pages by their primary device intent.

---

## 1. Mobile-First (The "Floor Mode")
*Priority: One-handed operation, low-light readability, high-contrast feedback.*

### Target Pages:
- **`Dancer Live Player (/live/[sessionId])`**: The most critical mobile experience.
- **`My Journal (/my-likes)`**: Personal history browsing.
- **`Session Recaps (/dj/[slug]/recap/[id])`**: Shared via social apps (IG/FB).
- **`Landing Page (/)`**: Initial entry via QR codes.

### Design Standards:
- **Touch Targets**: Minimum 44x44px for all interactive elements.
- **No Hover-Dependency**: Critical info or actions must never be hidden behind a hover state.
- **Active Feedback**: Every button must have a clear `:active` or focus state to acknowledge touch.
- **Thumb-Zone Navigation**: Heavy used items should be in the lower half of the screen (e.g., `BottomNav`).
- **Information Density**: Prioritize "Vibe" and "Action" over dense data tables.

---

## 2. Desktop-Focused (The "Booth & Office")
*Priority: Information density, precision, and workstation integration.*

### Target Pages:
- **`Download (/download)`**: Installer delivery for macOS/Windows/Linux.
- **`Technical Overview (/for/djs)`**: Research and vetting by professional DJs.
- **`DJ Portal / Login / Register`**: Complex identity setup and configuration.
- **`Deep Intelligence (/analytics)`**: High-resolution charting and multi-axis performance data.

### Design Standards:
- **Visual Breadth**: Use the full width of the monitor to create a "Command Center" feel.
- **Hover Enhancements**: Use tooltips and subtle hover transforms to provide depth and precision data.
- **Precision Typography**: Smaller, more detailed metadata is acceptable (e.g., file paths, CLI commands).
- **Sidecar Workflow**: Design with the expectation that the browser might be open next to a DJ software (VDJ/Serato).

---

## 3. Hybrid / Resume (The "Identity")
*Priority: Professionalism and accessibility.*

### Target Pages:
- **`DJ Profile (/dj/[slug])`**: The DJ's personal archive.

### Design Standards:
- **Responsive Balance**: Must look like a high-end electronic press kit (EPK) on desktop, while remaining a fast, scrollable history on mobile.

---

## 4. Implementation Guidelines (CSS)

### Graceful Degradation:
Always define mobile styles first, then use media queries for desktop enhancements.
```css
/* Mobile First */
.pro-card {
  padding: 1rem;
}

/* Desktop Expansion */
@media (min-width: 1024px) {
  .pro-card {
    padding: 2.5rem;
  }
}
```

### Motion Preference:
Always respect `prefers-reduced-motion` for complex animations in the "Slate & Neon" aesthetic.
```css
@media (prefers-reduced-motion: reduce) {
  .glow-effect {
    animation: none;
    transition: none;
  }
}
```
