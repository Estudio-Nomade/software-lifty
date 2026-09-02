# Driver Home Fullscreen Map Implementation Plan

> **For agentic workers:** Implemented inline 2026-09-02 from design spec.

**Goal:** Unify driver home on Active with fullscreen map, center GO, and collapsible earnings pill.

**Architecture:** ActiveScreen is the only home (online/offline). OnlineScreen thin-redirects to Active. Post-auth and menus target Active.

**Tech Stack:** Expo / React Native, existing BottomSheet, MapView, onlineStore, earnings API.

## Done

- [x] `GoButton` component
- [x] `ActiveScreen` offline/online unified UI
- [x] `OnlineScreen` redirect shell
- [x] Nav: postAuthRouting, AuthRedirectWatcher, TabBar, menus, trip exits, notifications
- [x] Tests: session-restore → `/active`, postAuthRouting approved → Active
- [x] biome + tsc + jest targeted suites
