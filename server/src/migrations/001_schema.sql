-- OpsHub schema. Two kinds of tables:
--   HUB tables      (users, sites, site_members, site_versions, deploy_history): global, guarded by the API.
--   BUSINESS tables (everything with site_id): row-level security (RLS) is FORCED on every one of them,
--                   so PostgreSQL itself refuses to read or write another site's rows.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opshub_app') THEN
    CREATE ROLE opshub_app LOGIN PASSWORD 'opshub_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

/* ------------------------------ HUB ------------------------------ */

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  hub_role      TEXT NOT NULL DEFAULT 'user' CHECK (hub_role IN ('admin', 'user')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS sites (
  id                   SERIAL PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  tagline              TEXT NOT NULL DEFAULT '',
  theme                JSONB NOT NULL DEFAULT '{}',          -- copy of published theme for the public directory
  draft_config         JSONB NOT NULL,                        -- what the builder edits
  published_version_id INTEGER,                               -- live release (FK added below)
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_members (
  site_id  INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('member', 'manager', 'admin')),
  PRIMARY KEY (site_id, user_id)
);

CREATE TABLE IF NOT EXISTS site_versions (
  id         SERIAL PRIMARY KEY,
  site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  config     JSONB NOT NULL,                                  -- immutable snapshot of the whole site definition
  note       TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, version)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_published_fk') THEN
    ALTER TABLE sites ADD CONSTRAINT sites_published_fk FOREIGN KEY (published_version_id) REFERENCES site_versions(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS deploy_history (
  id           SERIAL PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('publish', 'rollback')),
  version      INTEGER NOT NULL,                              -- version that went live
  from_version INTEGER,                                       -- version that was live before
  note         TEXT NOT NULL DEFAULT '',
  actor_id     INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

/* --------------------------- BUSINESS ---------------------------- */

CREATE TABLE IF NOT EXISTS site_counters (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  value   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, name)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id            SERIAL PRIMARY KEY,
  site_id       INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT,
  qty           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (qty >= 0),   -- DB-level guard: stock can never go negative
  price         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  reorder_level NUMERIC(14,2) NOT NULL DEFAULT 0,
  data          JSONB NOT NULL DEFAULT '{}',                         -- site-configured custom + calculated fields
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, id),
  UNIQUE (site_id, sku)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         SERIAL PRIMARY KEY,
  site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL,
  delta      NUMERIC(14,2) NOT NULL,
  balance    NUMERIC(14,2) NOT NULL,
  reason     TEXT NOT NULL,                                          -- receipt | adjustment | assignment | return | repair_part | import
  ref_type   TEXT,
  ref_id     INTEGER,
  actor_id   INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (site_id, item_id) REFERENCES inventory_items(site_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requests (
  id           SERIAL PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  req_no       INTEGER NOT NULL,
  title        TEXT NOT NULL,
  item_id      INTEGER,
  qty          NUMERIC(14,2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  priority     TEXT NOT NULL DEFAULT 'normal',
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'assigned', 'fulfilled', 'cancelled')),
  requester_id INTEGER REFERENCES users(id),
  data         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, id),
  UNIQUE (site_id, req_no),
  FOREIGN KEY (site_id, item_id) REFERENCES inventory_items(site_id, id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id          SERIAL PRIMARY KEY,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  request_id  INTEGER NOT NULL,
  level       INTEGER NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('manager', 'admin')),
  label       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
  decided_by  INTEGER REFERENCES users(id),
  comment     TEXT,
  decided_at  TIMESTAMPTZ,
  UNIQUE (site_id, id),
  UNIQUE (site_id, request_id, level),
  FOREIGN KEY (site_id, request_id) REFERENCES requests(site_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignments (
  id           SERIAL PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  asg_no       INTEGER NOT NULL,
  request_id   INTEGER NOT NULL,
  item_id      INTEGER NOT NULL,
  qty          NUMERIC(14,2) NOT NULL CHECK (qty > 0),
  assigned_to  TEXT NOT NULL,
  assignee_id  INTEGER REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'partial', 'consumed', 'closed')),
  qty_consumed NUMERIC(14,2) NOT NULL DEFAULT 0,
  qty_returned NUMERIC(14,2) NOT NULL DEFAULT 0,
  data         JSONB NOT NULL DEFAULT '{}',
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, id),
  UNIQUE (site_id, asg_no),
  UNIQUE (site_id, request_id),                                       -- a request can be issued only once, even under races
  CHECK (qty_consumed >= 0 AND qty_returned >= 0 AND qty_consumed + qty_returned <= qty),
  FOREIGN KEY (site_id, request_id) REFERENCES requests(site_id, id),
  FOREIGN KEY (site_id, item_id) REFERENCES inventory_items(site_id, id)
);

CREATE TABLE IF NOT EXISTS consumption_logs (
  id            SERIAL PRIMARY KEY,
  site_id       INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL,
  qty           NUMERIC(14,2) NOT NULL CHECK (qty > 0),
  note          TEXT,
  data          JSONB NOT NULL DEFAULT '{}',
  used_by       INTEGER REFERENCES users(id),
  used_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (site_id, assignment_id) REFERENCES assignments(site_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS repair_jobs (
  id            SERIAL PRIMARY KEY,
  site_id       INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  job_no        INTEGER NOT NULL,
  request_id    INTEGER,
  device        TEXT NOT NULL,
  fault         TEXT NOT NULL,
  status        TEXT NOT NULL,
  technician_id INTEGER REFERENCES users(id),
  labour_cost   NUMERIC(14,2) NOT NULL DEFAULT 0,
  parts_cost    NUMERIC(14,2) NOT NULL DEFAULT 0,
  data          JSONB NOT NULL DEFAULT '{}',
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  returned_at   TIMESTAMPTZ,
  UNIQUE (site_id, id),
  UNIQUE (site_id, job_no),
  UNIQUE (site_id, request_id),
  FOREIGN KEY (site_id, request_id) REFERENCES requests(site_id, id)
);

CREATE TABLE IF NOT EXISTS repair_logs (
  id          SERIAL PRIMARY KEY,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  repair_id   INTEGER NOT NULL,
  entry       TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  part_item_id INTEGER,
  part_qty    NUMERIC(14,2),
  actor_id    INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (site_id, repair_id) REFERENCES repair_jobs(site_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS returns (
  id            SERIAL PRIMARY KEY,
  site_id       INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ret_no        INTEGER NOT NULL,
  source_type   TEXT NOT NULL CHECK (source_type IN ('assignment', 'repair')),
  assignment_id INTEGER,
  repair_id     INTEGER,
  item_id       INTEGER,
  qty           NUMERIC(14,2) NOT NULL CHECK (qty > 0),
  condition     TEXT NOT NULL DEFAULT 'good',
  reason        TEXT,
  restocked     BOOLEAN NOT NULL DEFAULT FALSE,
  data          JSONB NOT NULL DEFAULT '{}',
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, ret_no),
  FOREIGN KEY (site_id, assignment_id) REFERENCES assignments(site_id, id),
  FOREIGN KEY (site_id, repair_id) REFERENCES repair_jobs(site_id, id),
  FOREIGN KEY (site_id, item_id) REFERENCES inventory_items(site_id, id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  request_id   INTEGER NOT NULL,
  event        TEXT NOT NULL,
  channel      TEXT NOT NULL DEFAULT 'sms',
  to_phone     TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  provider     TEXT,
  provider_ref TEXT,
  error        TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ,
  FOREIGN KEY (site_id, request_id) REFERENCES requests(site_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notif_req ON notifications (site_id, request_id);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications (site_id, status);

CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_site ON inventory_items (site_id);
CREATE INDEX IF NOT EXISTS idx_req_site_status ON requests (site_id, status);
CREATE INDEX IF NOT EXISTS idx_asg_site ON assignments (site_id);
CREATE INDEX IF NOT EXISTS idx_cons_asg ON consumption_logs (site_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_repair_site_status ON repair_jobs (site_id, status);
CREATE INDEX IF NOT EXISTS idx_moves_item ON stock_movements (site_id, item_id);

/* ------------------- ROW LEVEL SECURITY (site_id) ------------------- */
-- The API sets `app.site_id` inside each transaction. With no value set, NO rows are visible.

CREATE OR REPLACE FUNCTION app_site_id() RETURNS INTEGER LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.site_id', true), '')::INTEGER $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_counters','inventory_items','stock_movements','requests','approvals','assignments',
                           'consumption_logs','repair_jobs','repair_logs','returns','audit_log','notifications']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS site_isolation ON %I', t);
    EXECUTE format('CREATE POLICY site_isolation ON %I USING (site_id = app_site_id()) WITH CHECK (site_id = app_site_id())', t);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO opshub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO opshub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO opshub_app;
GRANT EXECUTE ON FUNCTION app_site_id() TO opshub_app;
