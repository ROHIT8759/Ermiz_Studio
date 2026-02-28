## Design Philosophy (Non-Negotiable)

1. **Structure over decoration**
2. **Information density without clutter**
3. **Every visual element earns its place**
4. **Fewer gestures than thinking**
5. **Editing must feel cheaper than rebuilding**

If it looks impressive but slows iteration, it’s wrong.

---

## Visual Identity

### Theme

- **Dark-first (black, not dark gray)**
- Base background: near-black, not pure black (eye strain)
- Foreground: off-white, never pure white

### Accent Color (Strict)

- **One accent only**: muted red _or_ muted purple
- Usage cap: **~10% of visible UI**
- Accent is for:
  - Selection
  - Focus
  - Active edges
  - Validation states

- Never for decoration

If it doesn’t communicate state → no color.

---

## Color System (Practical)

**Background layers**

- Canvas: `#0b0b0d`
- Panels: `#111114`
- Floating elements: `#15151a`

**Text**

- Primary: `#e6e6eb`
- Secondary: `#a1a1aa`
- Muted: `#6b6b75`

**Accent (choose one)**

- Purple: `#7c6cff`
- Red: `#ff4d4d`

Accent opacity used heavily (10–40%), not solid fills.

---

## Canvas Design (Core Experience)

### Grid

- **Very subtle**
- Appears only when dragging or zooming
- Never visible at rest

### Nodes

- Flat, rectangular
- Soft radius (6–8px)
- No skeuomorphism
- No shadows unless floating

**Node anatomy**

- Header (type + name)
- Body (inputs / outputs)
- Footer (status / errors)

No icons unless they communicate type faster than text.

---

## Connections (Wires)

- Straight or slightly curved (no spaghetti)
- Thin by default
- Thicker on hover / selection
- Color indicates **type**, not decoration:
  - Data → neutral
  - Control flow → accent
  - Error → muted red

No animations unless user is actively tracing.

---

## Interaction Model (Critical)

### Creation

- **Keyboard-first**
- `/` opens command palette
- Type to add node
- Click only when needed

This instantly separates you from n8n.

---

### Editing

- Inline edits everywhere
- No modals unless destructive
- No “apply” buttons

If a user has to confirm a change, it’s too heavy.

---

### Zooming

- Smooth
- Snap to semantic levels:
  - System
  - Process
  - Step

Zoom should change _meaning_, not just size.

---

## Layout Structure

```
┌─────────────────────────────┐
│ Top Bar (project context)   │
├───────┬─────────────────────┤
│ Left  │                     │
│ Rail  │   Canvas            │
│       │                     │
├───────┴─────────────────────┤
│ Bottom Context / Errors     │
└─────────────────────────────┘
```

---

## Left Rail (Minimal, Collapsible)

- APIs
- Processes
- Databases
- Queues
- Schemas

Text first. Icons optional.

This is navigation, not a toolbox.

---

## Inspector Panel (Right, On Demand)

Appears only when something is selected.

Contents:

- Metadata
- Inputs / outputs
- Validation
- References

No scrolling hell.
If it scrolls, it’s too dense.

---

## Process Design UX (Your Differentiator)

Processes should feel like **structured thinking**, not flowcharting.

### Process Card (Collapsed)

- Name
- Type
- Inputs → Outputs
- Execution model

Expands inline. No context switching.

---

### Steps Inside Process

- Linear by default
- Branching only when explicit
- No auto-magic joins

If logic is unclear, force explicit nodes.

---

## Database Blocks (Visual Language)

Databases should feel **heavy** and **stable**.

- Larger than normal nodes
- Less visually flexible
- Fewer connection points

This subconsciously communicates:

> “You don’t casually change this.”

---

## Error & Validation Design

Errors should be:

- Inline
- Quiet
- Persistent until fixed

No popups.
No alerts.
No toast spam.

---

## Motion (Subtle, Functional)

Allowed:

- Selection transitions
- Drag feedback
- Expand / collapse

Forbidden:

- Idle animations
- Decorative motion
- Auto-playing flows

Motion should explain causality, not impress.

---

## Change Cost Principle (Very Important)

> **Changing something must always be cheaper than recreating it**

Design implications:

- No destructive defaults
- No forced recreation
- Everything editable in place
- Undo is instant and deep

---

## What NOT to Copy from n8n

- Visual noise
- Overuse of icons
- Drag-only workflows
- Overly rounded playful nodes
- “Low-code” aesthetic

You are building a **developer tool**, not a marketing demo.

---

## Mental Model (Design)

> **VS Code meets Figma, not Miro meets PowerPoint**

If it feels like a diagramming tool, you failed.

---

## Final Design North Star

If a senior backend engineer can:

- read it instantly
- change it confidently
- trust what it generates

Then the design is correct.

---
