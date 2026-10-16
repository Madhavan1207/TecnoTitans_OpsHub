# Module registry (13 modules -> builder nodes)

Source of truth: `shared/registry.js`. Every module is a **typed node**: input ports declare which types they accept, the single output has a type, and `requires` lists what must be on the canvas first.

Port types: `stock`, `request`, `approved_request`, `assignment`, `consumption`, `return`, `repair`, `users`, `chart`, `file`, `ui` (+ implicit `session`, `layout` from core modules).

| # | Module (node) | Inputs (accepts) | Output | Requires | REST resource | Page |
|---|---|---|---|---|---|---|
| 1 | Authentication and RBAC *(core)* | - | session | always on | `/auth/*` | - |
| 2 | User Management | - | users | - | `members` | Team |
| 3 | Inventory | - | stock | - | `components` | Inventory |
| 4 | Dashboard Shell / Navigation / Forms *(core)* | - | layout | always on | `config` | Overview + layout |
| 5 | Request | stock (optional) | request | - | `requests` (+ public intake) | Requests |
| 6 | Approval | **request** (required) | approved_request | Request | `approvals` | Approvals |
| 7 | Material Assignment | request or approved_request (req.), stock (req.) | assignment | Request, Inventory | `assignments` | (logic) |
| 8 | Assignment Frontend | assignment (req.) | ui | Material Assignment | uses `assignments` | Assignments |
| 9 | Consumption Tracking | assignment (req.) | consumption | Material Assignment | `consumption` | Consumption |
| 10 | Return Management | assignment or repair (req.), stock (optional) | return | Assignment **or** Repair | `returns` | Returns |
| 11 | PCB Repair | request or approved_request (req.), stock (optional) | repair | Request | `repairs` | Repairs |
| 12 | Analytics Dashboard | any data type, multiple (req.) | chart | any data module | `analytics` | Analytics |
| 13 | Reports with Excel Integration | any data type, multiple (req.) | file | any data module | `reports` | Reports |

Rules enforced both in the builder (live) and on the server (save + publish):

1. **Typing**: an edge is valid only if the source output type is in the target port's `accepts`.
2. **Dependencies**: `requires` / `requiresAny` must be satisfied (Approval cannot exist without Request).
3. **Required ports** must be connected; single ports accept one edge; no cycles.
4. **Auto-wiring**: adding a module wires its inputs to the best match; adding Approval re-routes consumers so they only see *approved* requests (removing it routes them back).
5. **Core modules** cannot be removed.

Presets: *Inventory Starter* (Inventory, Analytics, Reports), *Approval Chain* (Inventory, Request, Approval, Material Assignment, Assignment Frontend), *Repair Shop* (Inventory, Request, Approval, PCB Repair, Return Management, Analytics).

Per-module `fields` (core + custom + calculated), `settings` (workflow options) and `actions` (minimum role per action, overridable per site) are defined in the same file.
