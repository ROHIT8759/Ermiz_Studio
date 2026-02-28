# ERMIZ TODO - Block System Refinement

## Auto-Connection & Data Flow

- [ ] Functional blocks auto-import input parameters from previous block's output
  - [ ] Smart matching: output name → input name
  - [ ] Type validation on connection
  - [ ] Visual feedback when parameters auto-map
- [ ] If previous block is API endpoint, inherit request parameters
  - [ ] Body, Query, Headers, Path params become available inputs
  - [ ] User can toggle which to use in functional block

## Database Blocks

- [ ] Visual schema builder
  - [ ] Table name input
  - [ ] Column list with types (string, int, boolean, date, json)
  - [ ] Primary key selection
  - [ ] Indexes definition
- [ ] Extra connection points for database instance
  - [ ] Visual indicator: "Connect to Database" port (different color)
  - [ ] Reusable database connections across blocks
- [ ] Join support
  - [ ] Extra connection ports on DB blocks to link to other DB blocks
  - [ ] Visual: side/bottom ports for joins
  - [ ] Join types in UI: INNER, LEFT, RIGHT, FULL
  - [ ] Auto-suggest join columns based on table schemas
- [ ] Query builder UI
  - [ ] SELECT columns (checkboxes)
  - [ ] WHERE conditions (visual builder)
  - [ ] ORDER BY, LIMIT, OFFSET
  - [ ] Preview SQL query generated

## Infrastructure Changes

- [x] Remove standalone Queue block
  - [ ] Make async execution a property of functional blocks instead
  - [ ] Add "Queue This" checkbox to any block
  - [ ] Queue configuration in block settings (retry, delay, priority)

## Connection System

- [ ] Different port types:
  - [ ] **Data flow** (green) - Normal execution flow
  - [ ] **Database** (purple) - Connect to DB instance
  - [ ] **Join** (blue) - Connect DB blocks together
  - [ ] **Error** (red) - Error handling paths
- [ ] Port validation: can only connect compatible types

## Developer Experience

- [ ] Hover over connection shows data shape preview
- [ ] Click block to see current data snapshot (when testing)
- [ ] Visual diff when auto-imported parameters change
- [ ] "Missing parameters" warnings on blocks

## Nice-to-Haves

- [ ] Template blocks with pre-configured common patterns
- [ ] Drag output parameter onto next block to auto-connect
- [ ] AI suggests next block based on current flow
- [ ] Export flow as OpenAPI/Swagger spec
