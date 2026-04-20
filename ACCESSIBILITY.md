# Accessibility — WCAG 2.1 AA Compliance

SmartStadium AI targets **WCAG 2.1 Level AA** compliance across the fan PWA and admin dashboard.

## ✅ Compliance Checklist

### Perceivable

| Criterion | Status | Implementation |
|---|---|---|
| 1.1.1 Non-text Content | ✅ | All images/icons have `alt` or `aria-hidden="true"` |
| 1.3.1 Info & Relationships | ✅ | Semantic HTML5: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>` |
| 1.3.2 Meaningful Sequence | ✅ | DOM order matches visual order |
| 1.3.3 Without Sensory | ✅ | Alerts use text, not colour alone |
| 1.4.1 Use of Color | ✅ | Status badges use text labels (normal/warning/critical) |
| 1.4.3 Contrast (Text) | ✅ | `--text-primary: #f0f4ff` on `#121929` = **15.5:1** ratio |
| 1.4.3 Contrast (Secondary) | ✅ | `--text-secondary: #8b9dc3` on `#0a0f1e` = **4.9:1** ratio |
| 1.4.4 Resize Text | ✅ | Fluid layout, em-based — works at 200% zoom |
| 1.4.10 Reflow | ✅ | Responsive single-column at 320px |
| 1.4.11 Non-text Contrast | ✅ | UI components meet 3:1 against adjacent colours |

### Operable

| Criterion | Status | Implementation |
|---|---|---|
| 2.1.1 Keyboard | ✅ | All interactive elements keyboard-operable |
| 2.1.2 No Keyboard Trap | ✅ | Modal closes on Escape; focus returns to trigger |
| 2.4.1 Bypass Blocks | ✅ | Skip-to-main-content link as first focusable element |
| 2.4.3 Focus Order | ✅ | Logical tab order throughout |
| 2.4.7 Focus Visible | ✅ | 3px outline on all `:focus-visible` — never suppressed |
| 2.4.11 Focus Appearance | ✅ | High-contrast focus ring with 3px offset |
| 2.5.3 Label in Name | ✅ | `aria-label` matches visible button text |

### Tab Navigation (ARIA Tabs Pattern)
- Arrow keys (←/→) navigate between tabs
- Home/End jump to first/last tab
- Selected tab is `aria-selected="true"`, others `tabindex="-1"`
- Panels linked via `aria-controls` / `role="tabpanel"`

### Understandable

| Criterion | Status | Implementation |
|---|---|---|
| 3.1.1 Language of Page | ✅ | `<html lang="en">` |
| 3.2.1 On Focus | ✅ | No unexpected context changes on focus |
| 3.3.1 Error Identification | ✅ | Form errors specify which field and how to fix |
| 3.3.2 Labels or Instructions | ✅ | All inputs have `<label>` + `aria-describedby` help text |

### Robust

| Criterion | Status | Implementation |
|---|---|---|
| 4.1.1 Parsing | ✅ | Valid HTML5, no duplicate IDs |
| 4.1.2 Name, Role, Value | ✅ | Custom components use native HTML or full ARIA |
| 4.1.3 Status Messages | ✅ | `aria-live="polite"` on all status regions |

## 🔔 Live Region Usage

| Region | Element | `aria-live` | Purpose |
|---|---|---|---|
| Crowd banner | `#crowd-banner` | `polite` | Crowd status updates |
| Zone list | `#zone-list` | — (polite via JS) | Zone densities |
| Critical alert | `#critical-alert` | `assertive` | Emergency zone alerts |
| Gate updates | `#gates-updated` | `polite` | Last-updated timestamp |
| AI chat | `#chat-messages` | `polite` | Gemini responses |
| Toast notification | `#toast` | `assertive` | Auth/system messages |

## ♿ High-Contrast Mode

Toggle via the ◑ button in the header (`aria-pressed` reflects state).  
Preference persisted in `localStorage` across sessions.

High-contrast overrides:
- Background: `#000000`
- Text: `#ffffff`
- Primary: `#7c9bff` (better contrast on pure black)

## 🧪 Automated Accessibility Testing

```bash
# Install axe-core
npm install --save-dev axe-core @axe-core/playwright

# Run with Playwright
npx playwright test tests/e2e/user_journey.spec.js

# Check console in browser
# The app.js registers a service worker; use axe browser extension for live testing
```

**axe-core** checks are integrated into the E2E test suite.

## 🖥️ Tested With

- **NVDA + Chrome** — screen reader navigation verified
- **VoiceOver + Safari (iOS)** — mobile accessibility verified
- **Keyboard-only** — all features operable without mouse
- **200% browser zoom** — no content clipped or hidden
- **Colour blindness simulation** — colour not sole indicator
