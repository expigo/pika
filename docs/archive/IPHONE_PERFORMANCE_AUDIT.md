# iPhone 14 Pro Performance Audit

**Date**: 2026-02-02
**Device**: iPhone 14 Pro (iOS / Chrome WebKit)
**Issue**: UI Unresponsive ("Freeze") after navigation.
**Scope**: `BottomNav`, CSS Compositing, Transition Performance.

## Symptom Analysis
The user reports:
1.  **"Page renders nicely"**: Confirming the previous layout fixes (safe-area) were successful.
2.  **"It loads (slower than Android)"**: Indicates a heavy Main Thread load or Compositor strain during the transition.
3.  **"Can't click anything else for some time"**: This is a classic **Thread Lock**. The browser is too busy painting or executing JS to process input events.

## Root Cause Candidates

### 1. The "Glassmorphism" Trap (High Confidence)
**The Suspect**: `backdrop-blur-lg` (Blur 24px) on a `fixed` element.
**The Mechanism**:
-   On iOS WebKit, `backdrop-filter` is computationally expensive. It requires the GPU to:
    1.  Capture the rendered content *behind* the element.
    2.  Apply a Gaussian blur kernel.
    3.  Composite the result.
-   **The Trigger**: When you navigate, the *entire page content* behind the nav bar changes. The browser tries to paint the new page AND re-calculate the live blur effect simultaneously.
-   **The Multiplier**: The iPhone 14 Pro runs at **120Hz (ProMotion)**. The browser aims to do this 120 times per second. If the frame budget (8ms) is exceeded, the input handler can get de-prioritized or locked until the paint queue settles.
-   **Why not Android?**: Android's renderer (Blink) might handle this differently, or the specific device runs at 60Hz giving 2x the time per frame, or it simply drops frames instead of blocking input.

### 2. `transition-all` on Navigation
**Location**: `packages/web/src/components/BottomNav.tsx` -> `transition-all duration-300`.
**The Problem**:
-   `transition-all` forces the browser to monitor *every* animatable property.
-   Combined with the route change (which might trigger layout shifts), this adds overhead.
-   Animating a container with `backdrop-filter` is notorious for performance penalties.

### 3. Hydration Bottleneck
**The Scenario**: The new page (e.g., `/live`) might have heavy React components that hydrate immediately on mount.
-   If hydration takes 500ms+ of CPU time, the main thread is blocked. No clicks can be processed.
-   However, if this were pure JS weight, the Android device (likely slower CPU) should suffer *more*, not less. The fact that the powerful iPhone suffers suggests a **Graphics/Compositor** bottleneck (specific to WebKit/Resolution) rather than raw CPU.

## Recommendation

**Fix Strategy**: Reduce Graphical Complexity during transitions to free up the Main/Compositor thread.

### Plan A: Optimize CSS (Recommended)
1.  **Remove `transition-all`** from the `nav` container. It's unnecessary for simple opacity/color changes.
2.  **Reduce Blur**: Lower the blur radius or remove it entirely on mobile to test.
    -   Change `backdrop-blur-lg` to `backdrop-blur-md` or remove it.
    -   Increase opacity of the background: `bg-slate-950/90` -> `bg-slate-950` (Opaque).

### Plan B: Interaction Optimization
1.  Ensure `touch-action: manipulation` allows fast clicks (already present).

## Scoring
-   **Priority**: **Critical** (User cannot interact with the app).
-   **Complexity**: **High** (Debugging specific renderer-level performance quirks).
-   **Value**: **High** (Essential for "Premium" feel).
-   **Effect**: Restores fluid 120Hz interaction.
