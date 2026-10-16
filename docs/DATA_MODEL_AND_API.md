# Data model and API design

## Data model

**Hub tables** (global, guarded by the API): `users`, `sites` (`draft_config` JSONB, `published_version_id`), `site_members (site_id, user_id, role)`, `site_versions (site_id, version, config JSONB)`, `deploy_history (action publish|rollback, version, from_version, actor)`.

**Business tables** (all carry `site_id`, RLS forced with policy `site_id = app_site_id()`):

```
inventory_items (sku, name, category, qty CHECK>=0, price, reorder_level, data JSONB)   UNIQUE(site_id, sku)
stock_movements (item_id, delta, balance, reason, ref_type, ref_id)
requests        (req_no, title, item_id, qty, priority, status, requester_id, data JSONB)
approvals       (request_id, level, role, status, decided_by, comment)                   UNIQUE(site_id, request_id, level)
assignments     (asg_no, request_id UNIQUE, item_id, qty, assigned_to, assignee_id, qty_consumed, qty_returned, data)
consumption_logs(assignment_id, qty, note, data)
repair_jobs     (job_no, request_id UNIQUE, device, fault, status, labour_cost, parts_cost, data)
repair_logs     (repair_id, entry, from_status, to_status, part_item_id, part_qty)
returns         (ret_no, source_type assignment|repair, assignment_id, repair_id, qty, condition, restocked)
notifications (request_id, event, to_phone, message, status queued|sending|sent|failed|skipped, provider, error, attempts)
site_counters, audit_log
```

* Core fields are real columns; **site-configured custom and calculated fields live in `data` JSONB** (so one table serves every site).
* Every cross-table reference is a **composite FK `(site_id, id)`**, so a row can never point into another site.
* `app.site_id` is set per transaction; with no value set, zero rows are visible.

## Site config (JSONB)

```json
{ "siteId": 3, "slug": "distribution", "name": "...", "theme": { "layout": "rail", "primary": "#8B5CF6", "...": "..." },
  "modules": [ { "type": "inventory", "position": {"x":290,"y":0}, "config": { "fields": [ ... ] } } ],
  "edges":   [ { "source": "inventory", "target": "material_assignment", "targetHandle": "stock" } ],
  "pages":   [ { "path": "inventory", "title": "Inventory", "module": "inventory" } ],
  "roles":   { "member": { "label": "Field staff" } } }
```

## API (all JSON; `Authorization: Bearer <jwt>`)

**Hub**
| Method | Path | Role |
|---|---|---|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me`, `/api/sites`, `/api/hub/overview` | signed in |
| GET | `/api/registry`, `/api/public/sites`, `/api/public/sites/:slug` | Public |
| POST | `/api/sites` (create, optional preset) | Hub admin |
| GET/POST/PATCH | `/api/hub/users`, `PUT /api/hub/users/:id/memberships/:siteId` | Hub admin |
| GET/PUT | `/api/sites/:slug/builder`, `/draft` | Site admin |
| POST | `/api/sites/:slug/validate`, `/publish`, `/rollback` | Site admin |
| GET | `/api/sites/:slug/versions`, `/deploys` | Site admin |

**Site** (`/api/:siteId/...`, `:siteId` = slug or id; module must be enabled in the live config)
| Resource | Endpoints | Min role (default, per-site override) |
|---|---|---|
| `config` | GET | any (renderer boot) |
| `public/form`, `public/requests` | GET, POST | Public (only if enabled) |
| `components` | GET, GET/:id, POST, PUT/:id, POST/:id/adjust, DELETE/:id, GET/:id/movements | member read, manager write, admin delete |
| `requests` | GET, GET/:id, POST, POST/:id/cancel, GET/:id/notifications, POST/:id/notify, POST/:id/notifications/:nid/resend | member (own), manager sees all and sends SMS |
| `public/track` | POST `{ref, phone}` | Public (needs reference AND matching phone) |
| `approvals` | GET, GET history, POST/:id/decide | manager |
| `assignments` | GET, GET ready, GET/:id, POST | member (own) / manager issues |
| `consumption` | GET, POST | member (own assignments) |
| `returns` | GET, POST | member |
| `repairs` | GET, ready, GET/:id, POST, PUT/:id, POST/:id/status, POST/:id/parts, DELETE | member, admin delete |
| `analytics` | GET | member |
| `reports` | GET, GET export/:entity, GET template/:entity, POST import/:entity | export: manager, import: admin |
| `members` | GET, POST, PUT/:userId, DELETE/:userId | manager read, admin write |

Errors: `{ "error": "<code>", "message": "...", "details": { "errors": [{ "field", "message" }] } }` with 401 / 403 / 404 / 409 / 422.

## Transactions

`POST /assignments` runs one transaction: lock request, check status, insert assignment, lock inventory row, check stock, decrement, write movement, set request `assigned`. Any failure rolls everything back. Parts used in a repair, returns that restock, and imports follow the same pattern.
