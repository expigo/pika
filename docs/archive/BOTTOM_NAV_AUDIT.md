# BottomNav Implementation Audit

**Date**: 2026-02-02
**Auditor**: Antigravity (Principal Web Developer)
**Scope**: `BottomNav` component, `layout.tsx`, and mobile responsiveness on iOS (Safari/Chrome).

## Executive Summary
Users on iPhone devices are reporting issues ("signaling progress/problems") likely due to the application not correctly handling the device's "Safe Area" (notch and home indicator). This results in the Bottom Navigation being positioned incorrectly—either too low (interfering with the home swipe gesture) or visually broken by the browser's dynamic toolbars. Additionally, UI conflicts with toast notifications and potential content occlusion were identified.

## Critical Findings

### 1. Missing `viewport-fit=cover` (The Smoking Gun)
**Location**: `packages/web/src/app/layout.tsx`
**Problem**: The `viewport` export defines width and scale but omits `viewportFit: "cover"`.
**Impact**:
- iOS browsers (Safari/Chrome) default to a "safe" viewing mode where the webview is letterboxed inside the safe area.
- CSS environment variables `env(safe-area-inset-bottom)` resolve to `0px` because the browser considers the "safe" area to be the entire viewport.
- **Result**: The `BottomNav` calculation `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` fails to add the necessary padding for the Home Indicator. The nav items sit dangerously close to the bottom edge, making them hard to tap without triggering the OS "Go Home" gesture.

### 2. Toaster Notification Overlay
**Location**: `packages/web/src/app/layout.tsx`
**Problem**: `<Toaster position="bottom-center" />`.
**Impact**:
- Toast notifications appear directly over the Bottom Navigation.
- **Result**: Users cannot navigate while a toast is visible. If they try to tap "Hearts" or "Menu", they might accidentally dismiss a toast or be blocked.

### 3. Insufficient Main Content Padding
**Location**: `packages/web/src/app/layout.tsx`
**Problem**: `<main className="pb-20 ...">`. `pb-20` is `5rem` (80px).
**Impact**:
- The `BottomNav` height is dynamic: `1.5rem (padding) + 1.5rem (icon) + ~1rem (text) + safe-area-inset-bottom`.
- On iPhone architecture with a large safe area (e.g., ~34px), the total nav height can exceed 86px (12+24+10+6+34).
- **Result**: The very bottom of the page content (e.g., the last item in a list) may be visually covered by the navigation bar, preventing users from seeing or interacting with it.

---

## Scoring & Fix Proposals

### Fix 1: Enable Cover Viewport
**Action**: Add `viewportFit: "cover"` to the viewport configuration in `layout.tsx`.
- **Priority**: **Critical (5/5)** - Essential for correct rendering on modern mobile devices.
- **Complexity**: Low (1/10) - One line of code.
- **Value**: High (5/5) - Immediately resolves the spacing/usability issue.
- **Effect**: Unlocks the `env(safe-area-inset-*)` variables, allowing the nav to pad itself correctly.

### Fix 2: Relocate Toasts on Mobile
**Action**: Move Toaster to `top-center` or add a mobile-specific offset/position.
- **Priority**: **High (4/5)** - Major usability improvement.
- **Complexity**: Low (2/10) - Configuration change.
- **Value**: High (4/5) - Prevents UI blocking errors.
- **Effect**: Toasts appear safely at the top on mobile, or bottom-right on desktop.

### Fix 3: Dynamic Safe Padding for Main Content
**Action**: Update `<main>` padding to account for safe area explicitly.
- **Priority**: Medium (3/5) - Polish/Edge-case prevention.
- **Complexity**: Low (2/10) - CSS utility change.
- **Value**: Medium (3/5) - Ensures 100% content visibility.
- **Effect**: `pb-[calc(5rem+env(safe-area-inset-bottom))]`.

---

## Conclusion
The "progress signaling" (likely reporting of friction/bugs) from iPhone users is almost certainly caused by **Finding #1**. The lack of `viewport-fit=cover` means the app is fighting the OS gestures. Implementing these fixes will immediately stabilize the mobile experience.
