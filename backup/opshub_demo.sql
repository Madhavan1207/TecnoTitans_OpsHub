--
-- PostgreSQL database dump
--

\restrict PPssc7WvhRDvnTUj0earW28lb1nj25oXSnf4j3WMNp1OQVxe4MPYgl6ZFqgcemr

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: app_site_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_site_id() RETURNS integer
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.site_id', true), '')::INTEGER $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approvals (
    id integer NOT NULL,
    site_id integer NOT NULL,
    request_id integer NOT NULL,
    level integer NOT NULL,
    role text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by integer,
    comment text,
    decided_at timestamp with time zone,
    CONSTRAINT approvals_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'admin'::text]))),
    CONSTRAINT approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'skipped'::text])))
);

ALTER TABLE ONLY public.approvals FORCE ROW LEVEL SECURITY;


--
-- Name: approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.approvals_id_seq OWNED BY public.approvals.id;


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id integer NOT NULL,
    site_id integer NOT NULL,
    asg_no integer NOT NULL,
    request_id integer NOT NULL,
    item_id integer NOT NULL,
    qty numeric(14,2) NOT NULL,
    assigned_to text NOT NULL,
    assignee_id integer,
    status text DEFAULT 'issued'::text NOT NULL,
    qty_consumed numeric(14,2) DEFAULT 0 NOT NULL,
    qty_returned numeric(14,2) DEFAULT 0 NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assignments_check CHECK (((qty_consumed >= (0)::numeric) AND (qty_returned >= (0)::numeric) AND ((qty_consumed + qty_returned) <= qty))),
    CONSTRAINT assignments_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT assignments_status_check CHECK ((status = ANY (ARRAY['issued'::text, 'partial'::text, 'consumed'::text, 'closed'::text])))
);

ALTER TABLE ONLY public.assignments FORCE ROW LEVEL SECURITY;


--
-- Name: assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assignments_id_seq OWNED BY public.assignments.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    site_id integer NOT NULL,
    actor_id integer,
    action text NOT NULL,
    entity text,
    entity_id integer,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: consumption_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumption_logs (
    id integer NOT NULL,
    site_id integer NOT NULL,
    assignment_id integer NOT NULL,
    qty numeric(14,2) NOT NULL,
    note text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    used_by integer,
    used_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consumption_logs_qty_check CHECK ((qty > (0)::numeric))
);

ALTER TABLE ONLY public.consumption_logs FORCE ROW LEVEL SECURITY;


--
-- Name: consumption_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consumption_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consumption_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consumption_logs_id_seq OWNED BY public.consumption_logs.id;


--
-- Name: deploy_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deploy_history (
    id integer NOT NULL,
    site_id integer NOT NULL,
    action text NOT NULL,
    version integer NOT NULL,
    from_version integer,
    note text DEFAULT ''::text NOT NULL,
    actor_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deploy_history_action_check CHECK ((action = ANY (ARRAY['publish'::text, 'rollback'::text])))
);


--
-- Name: deploy_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deploy_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deploy_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deploy_history_id_seq OWNED BY public.deploy_history.id;


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    site_id integer NOT NULL,
    sku text NOT NULL,
    name text NOT NULL,
    category text,
    qty numeric(14,2) DEFAULT 0 NOT NULL,
    price numeric(14,2) DEFAULT 0 NOT NULL,
    reorder_level numeric(14,2) DEFAULT 0 NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_items_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT inventory_items_qty_check CHECK ((qty >= (0)::numeric))
);

ALTER TABLE ONLY public.inventory_items FORCE ROW LEVEL SECURITY;


--
-- Name: inventory_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_items_id_seq OWNED BY public.inventory_items.id;


--
-- Name: repair_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repair_jobs (
    id integer NOT NULL,
    site_id integer NOT NULL,
    job_no integer NOT NULL,
    request_id integer,
    device text NOT NULL,
    fault text NOT NULL,
    status text NOT NULL,
    technician_id integer,
    labour_cost numeric(14,2) DEFAULT 0 NOT NULL,
    parts_cost numeric(14,2) DEFAULT 0 NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    returned_at timestamp with time zone
);

ALTER TABLE ONLY public.repair_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: repair_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.repair_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: repair_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.repair_jobs_id_seq OWNED BY public.repair_jobs.id;


--
-- Name: repair_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repair_logs (
    id integer NOT NULL,
    site_id integer NOT NULL,
    repair_id integer NOT NULL,
    entry text NOT NULL,
    from_status text,
    to_status text,
    part_item_id integer,
    part_qty numeric(14,2),
    actor_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.repair_logs FORCE ROW LEVEL SECURITY;


--
-- Name: repair_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.repair_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: repair_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.repair_logs_id_seq OWNED BY public.repair_logs.id;


--
-- Name: requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requests (
    id integer NOT NULL,
    site_id integer NOT NULL,
    req_no integer NOT NULL,
    title text NOT NULL,
    item_id integer,
    qty numeric(14,2) DEFAULT 1 NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    requester_id integer,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT requests_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'assigned'::text, 'fulfilled'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.requests FORCE ROW LEVEL SECURITY;


--
-- Name: requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.requests_id_seq OWNED BY public.requests.id;


--
-- Name: returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.returns (
    id integer NOT NULL,
    site_id integer NOT NULL,
    ret_no integer NOT NULL,
    source_type text NOT NULL,
    assignment_id integer,
    repair_id integer,
    item_id integer,
    qty numeric(14,2) NOT NULL,
    condition text DEFAULT 'good'::text NOT NULL,
    reason text,
    restocked boolean DEFAULT false NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT returns_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT returns_source_type_check CHECK ((source_type = ANY (ARRAY['assignment'::text, 'repair'::text])))
);

ALTER TABLE ONLY public.returns FORCE ROW LEVEL SECURITY;


--
-- Name: returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.returns_id_seq OWNED BY public.returns.id;


--
-- Name: site_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_counters (
    site_id integer NOT NULL,
    name text NOT NULL,
    value integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.site_counters FORCE ROW LEVEL SECURITY;


--
-- Name: site_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_members (
    site_id integer NOT NULL,
    user_id integer NOT NULL,
    role text NOT NULL,
    CONSTRAINT site_members_role_check CHECK ((role = ANY (ARRAY['member'::text, 'manager'::text, 'admin'::text])))
);


--
-- Name: site_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_versions (
    id integer NOT NULL,
    site_id integer NOT NULL,
    version integer NOT NULL,
    config jsonb NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.site_versions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: site_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.site_versions_id_seq OWNED BY public.site_versions.id;


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    draft_config jsonb NOT NULL,
    published_version_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sites_id_seq OWNED BY public.sites.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id integer NOT NULL,
    site_id integer NOT NULL,
    item_id integer NOT NULL,
    delta numeric(14,2) NOT NULL,
    balance numeric(14,2) NOT NULL,
    reason text NOT NULL,
    ref_type text,
    ref_id integer,
    actor_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.stock_movements FORCE ROW LEVEL SECURITY;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    hub_role text DEFAULT 'user'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_hub_role_check CHECK ((hub_role = ANY (ARRAY['admin'::text, 'user'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals ALTER COLUMN id SET DEFAULT nextval('public.approvals_id_seq'::regclass);


--
-- Name: assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments ALTER COLUMN id SET DEFAULT nextval('public.assignments_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: consumption_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_logs ALTER COLUMN id SET DEFAULT nextval('public.consumption_logs_id_seq'::regclass);


--
-- Name: deploy_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_history ALTER COLUMN id SET DEFAULT nextval('public.deploy_history_id_seq'::regclass);


--
-- Name: inventory_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_items_id_seq'::regclass);


--
-- Name: repair_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs ALTER COLUMN id SET DEFAULT nextval('public.repair_jobs_id_seq'::regclass);


--
-- Name: repair_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_logs ALTER COLUMN id SET DEFAULT nextval('public.repair_logs_id_seq'::regclass);


--
-- Name: requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests ALTER COLUMN id SET DEFAULT nextval('public.requests_id_seq'::regclass);


--
-- Name: returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns ALTER COLUMN id SET DEFAULT nextval('public.returns_id_seq'::regclass);


--
-- Name: site_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_versions ALTER COLUMN id SET DEFAULT nextval('public.site_versions_id_seq'::regclass);


--
-- Name: sites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites ALTER COLUMN id SET DEFAULT nextval('public.sites_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: approvals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approvals (id, site_id, request_id, level, role, label, status, decided_by, comment, decided_at) FROM stdin;
1	2	1	1	manager	Estimate approval	pending	\N	\N	\N
2	2	2	1	manager	Estimate approval	pending	\N	\N	\N
3	2	3	1	manager	Estimate approval	approved	4	\N	2026-10-12 05:14:31.373+00
4	2	4	1	manager	Estimate approval	approved	4	\N	2026-10-08 05:14:31.375+00
5	2	5	1	manager	Estimate approval	approved	4	\N	2026-10-06 05:14:31.388+00
6	2	6	1	manager	Estimate approval	approved	4	\N	2026-10-04 05:14:31.397+00
7	2	7	1	manager	Estimate approval	approved	4	\N	2026-10-01 05:14:31.405+00
8	2	8	1	manager	Estimate approval	rejected	4	Beyond economical repair	2026-10-03 05:14:31.417+00
\.


--
-- Data for Name: assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assignments (id, site_id, asg_no, request_id, item_id, qty, assigned_to, assignee_id, status, qty_consumed, qty_returned, data, created_by, created_at) FROM stdin;
1	3	1	9	24	4.00	Cabling crew A	7	partial	3.00	0.00	{"vehicle_no": "MH-04-1017"}	6	2026-10-06 03:14:31.434+00
2	3	2	10	25	300.00	Cabling crew A	7	partial	120.00	0.00	{"vehicle_no": "MH-04-1034"}	6	2026-10-08 03:14:31.442+00
3	3	3	11	26	20.00	Field team B	7	consumed	20.00	0.00	{"vehicle_no": "MH-04-1051"}	6	2026-10-10 03:14:31.45+00
4	3	4	12	30	40.00	Electrical crew	7	partial	10.00	0.00	{"vehicle_no": "MH-04-1068"}	6	2026-10-12 03:14:31.457+00
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, site_id, actor_id, action, entity, entity_id, detail, created_at) FROM stdin;
1	3	6	issue	assignment	1	{"qty": 4, "request_id": 9}	2026-10-14 03:14:31.427964+00
2	3	6	issue	assignment	2	{"qty": 300, "request_id": 10}	2026-10-14 03:14:31.427964+00
3	3	6	issue	assignment	3	{"qty": 20, "request_id": 11}	2026-10-14 03:14:31.427964+00
4	3	6	issue	assignment	4	{"qty": 40, "request_id": 12}	2026-10-14 03:14:31.427964+00
\.


--
-- Data for Name: consumption_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.consumption_logs (id, site_id, assignment_id, qty, note, data, used_by, used_at) FROM stdin;
1	3	1	1.00	Floor 1 backbone	{}	7	2026-10-08 03:14:31.435+00
2	3	1	2.00	Floor 2 backbone	{}	7	2026-10-10 03:14:31.437+00
3	3	2	120.00	Patch panel F1	{}	7	2026-10-09 03:14:31.443+00
4	3	3	20.00	Installed RSU-01..20	{}	7	2026-10-12 03:14:31.451+00
5	3	4	10.00	Panel 1	{}	7	2026-10-13 03:14:31.458+00
\.


--
-- Data for Name: deploy_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deploy_history (id, site_id, action, version, from_version, note, actor_id, created_at) FROM stdin;
1	1	publish	1	\N	Initial release	1	2026-10-14 03:14:31.289932+00
2	2	publish	1	\N	Initial release	1	2026-10-14 03:14:31.300928+00
3	3	publish	1	\N	Initial release	1	2026-10-14 03:14:31.309889+00
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_items (id, site_id, sku, name, category, qty, price, reorder_level, data, created_by, created_at, updated_at) FROM stdin;
1	1	RES-10K-0603	10k resistor 0603	Resistors	12000.00	0.02	3000.00	{"total": 240, "location": "Rack A1", "supplier": "Yageo", "shortfall": 0}	\N	2026-09-14 03:14:31.32+00	2026-10-14 03:14:31.319324+00
2	1	RES-1K-0603	1k resistor 0603	Resistors	8000.00	0.02	3000.00	{"total": 160, "location": "Rack A1", "supplier": "Yageo", "shortfall": 0}	\N	2026-09-15 03:14:31.322+00	2026-10-14 03:14:31.319324+00
4	1	CAP-10U-1206	10uF capacitor 1206	Capacitors	900.00	0.12	1000.00	{"total": 108, "location": "Rack A2", "supplier": "Murata", "shortfall": 100}	\N	2026-09-17 03:14:31.325+00	2026-10-14 03:14:31.319324+00
5	1	IC-STM32F103	STM32F103C8T6 MCU	ICs	240.00	3.40	100.00	{"total": 816, "location": "Cabinet B1", "supplier": "STMicro", "shortfall": 0}	\N	2026-09-18 03:14:31.326+00	2026-10-14 03:14:31.319324+00
7	1	IC-NE555	NE555 timer	ICs	410.00	0.30	150.00	{"total": 123, "location": "Cabinet B1", "supplier": "TI", "shortfall": 0}	\N	2026-09-20 03:14:31.339+00	2026-10-14 03:14:31.319324+00
8	1	CON-USBC-16P	USB-C 16 pin connector	Connectors	520.00	0.38	200.00	{"total": 197.6, "location": "Rack C3", "supplier": "Amphenol", "shortfall": 0}	\N	2026-09-21 03:14:31.349+00	2026-10-14 03:14:31.319324+00
9	1	CON-HDR-2X20	2x20 pin header	Connectors	330.00	0.22	150.00	{"total": 72.6, "location": "Rack C3", "supplier": "Samtec", "shortfall": 0}	\N	2026-09-22 03:14:31.351+00	2026-10-14 03:14:31.319324+00
10	1	PCB-BLANK-100	Blank PCB 100x100	PCBs	85.00	1.80	50.00	{"total": 153, "location": "Shelf D1", "supplier": "JLC", "shortfall": 0}	\N	2026-09-23 03:14:31.352+00	2026-10-14 03:14:31.319324+00
11	1	LED-RED-0805	Red LED 0805	Optoelectronics	4000.00	0.04	1500.00	{"total": 160, "location": "Rack A3", "supplier": "Kingbright", "shortfall": 0}	\N	2026-09-24 03:14:31.352+00	2026-10-14 03:14:31.319324+00
12	1	XTAL-8M	8 MHz crystal	Passives	35.00	0.50	60.00	{"total": 17.5, "location": "Rack A3", "supplier": "Abracon", "shortfall": 25}	\N	2026-09-25 03:14:31.353+00	2026-10-14 03:14:31.319324+00
13	1	CAB-USB-1M	USB cable 1 m	Cables	150.00	1.10	50.00	{"total": 165, "location": "Shelf E2", "supplier": "Generic", "shortfall": 0}	\N	2026-09-26 03:14:31.354+00	2026-10-14 03:14:31.319324+00
14	1	FUSE-2A-5X20	2A fuse 5x20	Protection	700.00	0.09	300.00	{"total": 63, "location": "Rack C1", "supplier": "Littelfuse", "shortfall": 0}	\N	2026-09-27 03:14:31.355+00	2026-10-14 03:14:31.319324+00
6	1	IC-LM7805	LM7805 regulator	ICs	40.00	0.45	80.00	{"total": 27, "location": "Cabinet B1", "supplier": "TI", "shortfall": 20}	\N	2026-09-19 03:14:31.326+00	2026-10-14 03:14:31.358+00
3	1	CAP-100N-0603	100nF capacitor 0603	Capacitors	20000.00	0.03	5000.00	{"total": 450, "location": "Rack A2", "supplier": "Murata", "shortfall": 0}	\N	2026-09-16 03:14:31.324+00	2026-10-14 03:14:31.359+00
18	2	IC-BGA-EC	Embedded controller BGA	ICs	6.00	9.80	5.00	{"total": 58.8}	\N	2026-09-17 03:14:31.363+00	2026-10-14 03:14:31.361016+00
19	2	CAP-TANT-100U	100uF tantalum capacitor	Capacitors	120.00	0.35	40.00	{"total": 42}	\N	2026-09-18 03:14:31.364+00	2026-10-14 03:14:31.361016+00
22	2	THERM-PASTE	Thermal paste 4g	Consumables	60.00	2.10	20.00	{"total": 126}	\N	2026-09-21 03:14:31.366+00	2026-10-14 03:14:31.361016+00
17	2	DC-JACK-45	DC power jack 4.5mm	Connectors	39.00	1.20	15.00	{"total": 48}	\N	2026-09-16 03:14:31.362+00	2026-10-14 03:14:31.38+00
20	2	MOSFET-AO4407	AO4407 P-MOSFET	ICs	53.00	0.55	20.00	{"total": 30.25}	\N	2026-09-19 03:14:31.365+00	2026-10-14 03:14:31.383+00
15	2	BAT-LAP-14	Laptop battery 14"	Batteries	13.00	38.00	5.00	{"total": 532}	\N	2026-09-14 03:14:31.361+00	2026-10-14 03:14:31.393+00
21	2	KB-LAP-US	Laptop keyboard US	Keyboards	2.00	18.00	4.00	{"total": 54}	\N	2026-09-20 03:14:31.366+00	2026-10-14 03:14:31.4+00
16	2	DISP-FLEX-156	Display flex cable 15.6"	Cables	21.00	6.50	8.00	{"total": 143}	\N	2026-09-15 03:14:31.362+00	2026-10-14 03:14:31.407+00
23	3	CAB-USB-1M	USB cable 1 m	Cables	400.00	1.10	120.00	{"uom": "pcs", "total": 440}	\N	2026-09-14 03:14:31.419+00	2026-10-14 03:14:31.418676+00
27	3	FUSE-2A-5X20	2A fuse 5x20	Protection	300.00	0.09	150.00	{"uom": "pcs", "total": 27}	\N	2026-09-18 03:14:31.423+00	2026-10-14 03:14:31.418676+00
28	3	WIRE-RED-2.5	Red wire 2.5 mm	Wire	900.00	0.80	300.00	{"uom": "m", "total": 720}	\N	2026-09-19 03:14:31.424+00	2026-10-14 03:14:31.418676+00
29	3	MCB-16A	MCB 16A single pole	Protection	22.00	3.90	30.00	{"uom": "pcs", "total": 85.8}	\N	2026-09-20 03:14:31.425+00	2026-10-14 03:14:31.418676+00
24	3	CAB-CAT6-305	Cat6 cable 305 m box	Cables	14.00	95.00	6.00	{"uom": "box", "total": 1710}	\N	2026-09-15 03:14:31.42+00	2026-10-14 03:14:31.432+00
25	3	CON-RJ45	RJ45 connector	Connectors	1200.00	0.15	400.00	{"uom": "pcs", "total": 225}	\N	2026-09-16 03:14:31.421+00	2026-10-14 03:14:31.441+00
26	3	ENC-IP65-200	IP65 enclosure 200mm	Enclosures	50.00	14.00	25.00	{"uom": "pcs", "total": 980}	\N	2026-09-17 03:14:31.422+00	2026-10-14 03:14:31.449+00
30	3	TERM-BLK-12	12-way terminal block	Connectors	70.00	0.60	40.00	{"uom": "pcs", "total": 66}	\N	2026-09-21 03:14:31.426+00	2026-10-14 03:14:31.454+00
\.


--
-- Data for Name: repair_jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.repair_jobs (id, site_id, job_no, request_id, device, fault, status, technician_id, labour_cost, parts_cost, data, created_by, created_at, updated_at, completed_at, returned_at) FROM stdin;
1	2	1	4	Dell Latitude 5420 board	No power, no LED	repairing	5	40.00	2.30	{"gst": 7.61, "total_cost": 42.3, "grand_total": 49.91, "board_serial": "SN-D5420-8841", "estimated_days": 3}	5	2026-10-08 03:14:31.376+00	2026-10-10 03:14:31.378+00	\N	\N
2	2	2	5	HP Pavilion 15	Battery lasts 20 minutes	testing	5	25.00	38.00	{"gst": 11.34, "total_cost": 63, "grand_total": 74.34, "board_serial": "SN-HP15-2210", "estimated_days": 3}	5	2026-10-06 03:14:31.389+00	2026-10-10 03:14:31.395+00	\N	\N
3	2	3	6	Lenovo ThinkPad E14	Several keys dead	completed	5	30.00	18.00	{"gst": 8.64, "total_cost": 48, "grand_total": 56.64, "board_serial": "SN-LT14-0932", "estimated_days": 3}	5	2026-10-04 03:14:31.398+00	2026-10-08 03:14:31.402+00	2026-10-08 03:14:31.402+00	\N
4	2	4	7	Asus VivoBook 15	Flicker + vertical lines	returned	5	35.00	6.50	{"gst": 7.47, "total_cost": 41.5, "grand_total": 48.97, "board_serial": "SN-AV15-7710", "estimated_days": 3}	5	2026-10-01 03:14:31.405+00	2026-10-04 03:14:31.409+00	2026-10-04 03:14:31.409+00	2026-10-05 03:14:31.414+00
\.


--
-- Data for Name: repair_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.repair_logs (id, site_id, repair_id, entry, from_status, to_status, part_item_id, part_qty, actor_id, created_at) FROM stdin;
1	2	1	Job opened	\N	diagnosing	\N	\N	5	2026-10-08 03:14:31.377+00
2	2	1	Status changed to repairing	diagnosing	repairing	\N	\N	5	2026-10-10 03:14:31.379+00
3	2	1	Used 1 x DC power jack 4.5mm	\N	\N	17	1.00	5	2026-10-10 03:14:31.382+00
4	2	1	Used 2 x AO4407 P-MOSFET	\N	\N	20	2.00	5	2026-10-11 03:14:31.386+00
5	2	2	Job opened	\N	diagnosing	\N	\N	5	2026-10-06 03:14:31.39+00
6	2	2	Status changed to awaiting parts	diagnosing	awaiting_parts	\N	\N	5	2026-10-07 03:14:31.391+00
7	2	2	Used 1 x Laptop battery 14"	\N	\N	15	1.00	5	2026-10-09 03:14:31.395+00
8	2	2	Status changed to testing	awaiting_parts	testing	\N	\N	5	2026-10-10 03:14:31.395+00
9	2	3	Job opened	\N	diagnosing	\N	\N	5	2026-10-04 03:14:31.399+00
10	2	3	Used 1 x Laptop keyboard US	\N	\N	21	1.00	5	2026-10-06 03:14:31.402+00
11	2	3	Status changed to completed	diagnosing	completed	\N	\N	5	2026-10-08 03:14:31.402+00
12	2	4	Job opened	\N	diagnosing	\N	\N	5	2026-10-01 03:14:31.406+00
13	2	4	Used 1 x Display flex cable 15.6"	\N	\N	16	1.00	5	2026-10-02 03:14:31.408+00
14	2	4	Status changed to completed	diagnosing	completed	\N	\N	5	2026-10-04 03:14:31.409+00
15	2	4	Returned to customer	completed	returned	\N	\N	5	2026-10-05 03:14:31.414+00
\.


--
-- Data for Name: requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.requests (id, site_id, req_no, title, item_id, qty, priority, notes, status, requester_id, data, created_at, updated_at) FROM stdin;
1	2	1	Laptop screen flickers	\N	1.00	high	\N	pending	5	{"warranty": false, "device_type": "Laptop", "customer_name": "Sanjay Kulkarni", "customer_phone": "98200 010137"}	2026-10-14 03:14:31.369+00	2026-10-14 03:14:31.369+00
2	2	2	Phone not charging	\N	1.00	normal	\N	pending	5	{"warranty": true, "device_type": "Phone", "customer_name": "Neha Joshi", "customer_phone": "98200 010274"}	2026-10-13 03:14:31.371+00	2026-10-13 03:14:31.371+00
3	2	3	TV no backlight	\N	1.00	normal	\N	approved	5	{"warranty": false, "device_type": "TV", "customer_name": "R. Fernandes", "customer_phone": "98200 010411"}	2026-10-12 03:14:31.373+00	2026-10-12 03:14:31.373+00
4	2	4	Mainboard dead - no power	\N	1.00	urgent	\N	assigned	5	{"warranty": true, "device_type": "Mainboard", "customer_name": "Omkar Pawar", "customer_phone": "98200 010548"}	2026-10-08 03:14:31.374+00	2026-10-08 03:14:31.374+00
5	2	5	Laptop battery drains fast	\N	1.00	normal	\N	assigned	5	{"warranty": false, "device_type": "Laptop", "customer_name": "Sunita Rao", "customer_phone": "98200 010685"}	2026-10-06 03:14:31.388+00	2026-10-06 03:14:31.388+00
6	2	6	Keyboard keys unresponsive	\N	1.00	low	\N	fulfilled	5	{"warranty": true, "device_type": "Laptop", "customer_name": "Imran Shaikh", "customer_phone": "98200 010822"}	2026-10-04 03:14:31.397+00	2026-10-04 03:14:31.397+00
7	2	7	Display flex tear	\N	1.00	normal	\N	fulfilled	5	{"warranty": false, "device_type": "Laptop", "customer_name": "Divya Shah", "customer_phone": "98200 010959"}	2026-10-01 03:14:31.404+00	2026-10-01 03:14:31.404+00
8	2	8	Water damage - TV mainboard	\N	1.00	normal	\N	rejected	5	{"warranty": true, "device_type": "Mainboard", "customer_name": "Hotel Sagar", "customer_phone": "98200 011096"}	2026-10-03 03:14:31.416+00	2026-10-03 03:14:31.416+00
9	3	1	Cat6 for Tower 3 rollout	24	4.00	normal	\N	assigned	7	{"needed_by": "2026-10-17", "field_site": "Tower 3, Andheri"}	2026-10-05 03:14:31.428+00	2026-10-14 03:14:31.433+00
10	3	2	RJ45 connectors for patch panels	25	300.00	normal	\N	assigned	7	{"needed_by": "2026-10-17", "field_site": "Tower 3, Andheri"}	2026-10-07 03:14:31.438+00	2026-10-14 03:14:31.441+00
11	3	3	Enclosures for roadside units	26	20.00	normal	\N	assigned	7	{"needed_by": "2026-10-17", "field_site": "Highway site 12"}	2026-10-09 03:14:31.445+00	2026-10-14 03:14:31.449+00
12	3	4	Terminal blocks for substation	30	40.00	normal	\N	assigned	7	{"needed_by": "2026-10-17", "field_site": "Substation K"}	2026-10-11 03:14:31.452+00	2026-10-14 03:14:31.455+00
13	3	5	MCBs for new feeder	29	10.00	normal	\N	approved	7	{"needed_by": "2026-10-17", "field_site": "Substation K"}	2026-10-13 03:14:31.459+00	2026-10-13 03:14:31.459+00
14	3	6	Fuses for spares kit	27	100.00	normal	\N	approved	7	{"needed_by": "2026-10-17", "field_site": "Depot"}	2026-10-14 03:14:31.46+00	2026-10-14 03:14:31.46+00
15	3	7	USB cables (cancelled - duplicate)	23	50.00	normal	\N	cancelled	7	{"needed_by": "2026-10-17", "field_site": "Depot"}	2026-10-10 03:14:31.461+00	2026-10-10 03:14:31.461+00
\.


--
-- Data for Name: returns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.returns (id, site_id, ret_no, source_type, assignment_id, repair_id, item_id, qty, condition, reason, restocked, data, created_by, created_at) FROM stdin;
1	2	1	repair	\N	4	\N	1.00	good	Repaired unit handed back	f	{}	4	2026-10-05 03:14:31.415+00
\.


--
-- Data for Name: site_counters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.site_counters (site_id, name, value) FROM stdin;
2	repair	4
2	return	1
2	request	8
3	assignment	4
3	request	7
\.


--
-- Data for Name: site_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.site_members (site_id, user_id, role) FROM stdin;
1	2	manager
3	2	member
1	3	admin
2	4	manager
2	5	member
1	5	member
3	6	manager
3	7	member
\.


--
-- Data for Name: site_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.site_versions (id, site_id, version, config, note, created_by, created_at) FROM stdin;
1	1	1	{"name": "Central Stores", "slug": "central-stores", "edges": [{"id": "inventory->analytics:data", "source": "inventory", "target": "analytics", "targetHandle": "data"}, {"id": "inventory->reports_excel:data", "source": "inventory", "target": "reports_excel", "targetHandle": "data"}], "pages": [{"icon": "Users", "path": "team", "title": "Team", "hidden": false, "module": "user_management"}, {"icon": "Boxes", "path": "inventory", "title": "Inventory", "hidden": false, "module": "inventory"}, {"icon": "BarChart3", "path": "analytics", "title": "Analytics", "hidden": false, "module": "analytics"}, {"icon": "FileSpreadsheet", "path": "reports", "title": "Reports", "hidden": false, "module": "reports_excel"}], "roles": {"admin": {"label": "Stores head"}, "member": {"label": "Store clerk"}, "manager": {"label": "Store keeper"}}, "theme": {"bg": "#F4F1E8", "ink": "#0D1621", "font": "grotesk", "mode": "light", "accent": "#1D4FB5", "layout": "sidebar", "radius": 4, "shadow": "hard", "density": "comfortable", "heading": "display", "primary": "#FFDD0A", "surface": "#FFFFFF"}, "modules": [{"id": "auth_rbac", "type": "auth_rbac", "config": {}, "position": {"x": 0, "y": 0}}, {"id": "dashboard_shell", "type": "dashboard_shell", "config": {}, "position": {"x": 0, "y": 130}}, {"id": "user_management", "type": "user_management", "config": {}, "position": {"x": 0, "y": 260}}, {"id": "inventory", "type": "inventory", "config": {"fields": [{"key": "sku", "core": true, "type": "text", "label": "SKU", "required": true}, {"key": "name", "core": true, "type": "text", "label": "Component", "required": true}, {"key": "category", "core": true, "type": "text", "label": "Category"}, {"key": "qty", "min": 0, "core": true, "type": "number", "label": "On hand", "default": 0, "required": true}, {"key": "price", "min": 0, "core": true, "type": "currency", "label": "Unit price", "default": 0}, {"key": "reorder_level", "min": 0, "core": true, "type": "number", "label": "Reorder at", "default": 0}, {"key": "supplier", "type": "text", "label": "Supplier"}, {"key": "location", "type": "text", "label": "Rack / bin"}, {"key": "total", "help": "TOTAL = QTY x PRICE", "type": "currency", "label": "TOTAL", "formula": "qty * price"}, {"key": "shortfall", "help": "How many units below the reorder level", "type": "number", "label": "Shortfall", "formula": "MAX(reorder_level - qty, 0)"}], "lowStockAlerts": true}, "position": {"x": 290, "y": 0}}, {"id": "analytics", "type": "analytics", "config": {"widgets": ["kpis", "stock_by_category", "low_stock", "consumption_by_item"]}, "position": {"x": 580, "y": 340}}, {"id": "reports_excel", "type": "reports_excel", "config": {"permissions": {"export": "manager", "import": "admin"}}, "position": {"x": 580, "y": 470}}], "tagline": "Inventory, stock control and analytics."}	Initial release	1	2026-10-14 03:14:31.289932+00
2	2	1	{"name": "Service Centre", "slug": "service-centre", "edges": [{"id": "inventory->request:stock", "source": "inventory", "target": "request", "targetHandle": "stock"}, {"id": "request->approval:request", "source": "request", "target": "approval", "targetHandle": "request"}, {"id": "approval->pcb_repair:request", "source": "approval", "target": "pcb_repair", "targetHandle": "request"}, {"id": "inventory->pcb_repair:stock", "source": "inventory", "target": "pcb_repair", "targetHandle": "stock"}, {"id": "pcb_repair->return_management:source", "source": "pcb_repair", "target": "return_management", "targetHandle": "source"}, {"id": "inventory->return_management:stock", "source": "inventory", "target": "return_management", "targetHandle": "stock"}, {"id": "inventory->analytics:data", "source": "inventory", "target": "analytics", "targetHandle": "data"}, {"id": "approval->analytics:data", "source": "approval", "target": "analytics", "targetHandle": "data"}, {"id": "return_management->analytics:data", "source": "return_management", "target": "analytics", "targetHandle": "data"}, {"id": "pcb_repair->analytics:data", "source": "pcb_repair", "target": "analytics", "targetHandle": "data"}, {"id": "inventory->reports_excel:data", "source": "inventory", "target": "reports_excel", "targetHandle": "data"}, {"id": "approval->reports_excel:data", "source": "approval", "target": "reports_excel", "targetHandle": "data"}, {"id": "return_management->reports_excel:data", "source": "return_management", "target": "reports_excel", "targetHandle": "data"}, {"id": "pcb_repair->reports_excel:data", "source": "pcb_repair", "target": "reports_excel", "targetHandle": "data"}], "pages": [{"icon": "Users", "path": "team", "title": "Team", "hidden": false, "module": "user_management"}, {"icon": "Boxes", "path": "inventory", "title": "Inventory", "hidden": false, "module": "inventory"}, {"icon": "FilePlus2", "path": "requests", "title": "Requests", "hidden": false, "module": "request"}, {"icon": "Stamp", "path": "approvals", "title": "Approvals", "hidden": false, "module": "approval"}, {"icon": "CircuitBoard", "path": "repairs", "title": "Repairs", "hidden": false, "module": "pcb_repair"}, {"icon": "Undo2", "path": "returns", "title": "Returns", "hidden": false, "module": "return_management"}, {"icon": "BarChart3", "path": "analytics", "title": "Analytics", "hidden": false, "module": "analytics"}, {"icon": "FileSpreadsheet", "path": "reports", "title": "Reports", "hidden": false, "module": "reports_excel"}], "roles": {"admin": {"label": "Centre admin"}, "member": {"label": "Technician"}, "manager": {"label": "Service manager"}}, "theme": {"bg": "#F2F7F6", "ink": "#10302C", "font": "serif", "mode": "light", "accent": "#E4572E", "layout": "topnav", "radius": 14, "shadow": "soft", "density": "comfortable", "heading": "normal", "primary": "#0E9F8E", "surface": "#FFFFFF"}, "modules": [{"id": "auth_rbac", "type": "auth_rbac", "config": {}, "position": {"x": 0, "y": 0}}, {"id": "dashboard_shell", "type": "dashboard_shell", "config": {}, "position": {"x": 0, "y": 130}}, {"id": "user_management", "type": "user_management", "config": {}, "position": {"x": 0, "y": 260}}, {"id": "inventory", "type": "inventory", "config": {"fields": [{"key": "sku", "core": true, "type": "text", "label": "Part no.", "required": true}, {"key": "name", "core": true, "type": "text", "label": "Spare part", "required": true}, {"key": "category", "core": true, "type": "text", "label": "Part type"}, {"key": "qty", "min": 0, "core": true, "type": "number", "label": "In stock", "default": 0, "required": true}, {"key": "price", "min": 0, "core": true, "type": "currency", "label": "Cost", "default": 0}, {"key": "reorder_level", "min": 0, "core": true, "type": "number", "label": "Reorder level", "default": 0}, {"key": "total", "type": "currency", "label": "Stock value", "formula": "qty * price"}], "lowStockAlerts": true}, "position": {"x": 290, "y": 0}}, {"id": "request", "type": "request", "config": {"fields": [{"key": "title", "core": true, "type": "text", "label": "Problem summary", "required": true}, {"key": "item_id", "ref": "components", "core": true, "type": "ref", "label": "Component", "hidden": true}, {"key": "qty", "min": 1, "core": true, "type": "number", "label": "Qty", "hidden": true, "default": 1, "required": true}, {"key": "priority", "core": true, "type": "select", "label": "Priority", "default": "normal", "options": ["low", "normal", "high", "urgent"]}, {"key": "notes", "core": true, "type": "textarea", "label": "Notes"}, {"key": "customer_name", "type": "text", "label": "Customer name", "required": true}, {"key": "customer_phone", "type": "text", "label": "Phone"}, {"key": "device_type", "type": "select", "label": "Device type", "options": ["Laptop", "Phone", "TV", "Mainboard", "Other"]}, {"key": "warranty", "type": "boolean", "label": "In warranty?"}, {"key": "purchase_date", "type": "date", "label": "Purchase date"}], "numberPrefix": "SC", "publicIntake": true}, "position": {"x": 290, "y": 170}}, {"id": "approval", "type": "approval", "config": {"levels": [{"role": "manager", "label": "Estimate approval"}], "requireComment": true, "allowSelfApproval": false}, "position": {"x": 580, "y": 170}}, {"id": "pcb_repair", "type": "pcb_repair", "config": {"fields": [{"key": "device", "core": true, "type": "text", "label": "Device / board", "required": true}, {"key": "fault", "core": true, "type": "textarea", "label": "Reported fault", "required": true}, {"key": "labour_cost", "min": 0, "core": true, "type": "currency", "label": "Labour", "default": 0}, {"key": "parts_cost", "core": true, "type": "currency", "label": "Parts", "system": true}, {"key": "board_serial", "type": "text", "label": "Board serial"}, {"key": "estimated_days", "min": 0, "type": "number", "label": "Estimated days"}, {"key": "total_cost", "type": "currency", "label": "Subtotal", "formula": "labour_cost + parts_cost"}, {"key": "gst", "type": "currency", "label": "GST 18%", "formula": "ROUND(total_cost * 0.18, 2)"}, {"key": "grand_total", "type": "currency", "label": "Grand total", "formula": "total_cost + gst"}], "statuses": ["diagnosing", "awaiting_parts", "repairing", "testing", "completed"]}, "position": {"x": 870, "y": 290}}, {"id": "return_management", "type": "return_management", "config": {"restockGood": false}, "position": {"x": 1160, "y": 340}}, {"id": "analytics", "type": "analytics", "config": {"widgets": ["kpis", "requests_by_status", "requests_trend", "repair_status"]}, "position": {"x": 580, "y": 340}}, {"id": "reports_excel", "type": "reports_excel", "config": {}, "position": {"x": 580, "y": 470}}], "tagline": "Requests, approvals, repairs and returns."}	Initial release	1	2026-10-14 03:14:31.300928+00
3	3	1	{"name": "Distribution", "slug": "distribution", "edges": [{"id": "inventory->request:stock", "source": "inventory", "target": "request", "targetHandle": "stock"}, {"id": "request->material_assignment:request", "source": "request", "target": "material_assignment", "targetHandle": "request"}, {"id": "inventory->material_assignment:stock", "source": "inventory", "target": "material_assignment", "targetHandle": "stock"}, {"id": "material_assignment->assignment_frontend:assignment", "source": "material_assignment", "target": "assignment_frontend", "targetHandle": "assignment"}, {"id": "material_assignment->consumption_tracking:assignment", "source": "material_assignment", "target": "consumption_tracking", "targetHandle": "assignment"}, {"id": "inventory->analytics:data", "source": "inventory", "target": "analytics", "targetHandle": "data"}, {"id": "request->analytics:data", "source": "request", "target": "analytics", "targetHandle": "data"}, {"id": "material_assignment->analytics:data", "source": "material_assignment", "target": "analytics", "targetHandle": "data"}, {"id": "consumption_tracking->analytics:data", "source": "consumption_tracking", "target": "analytics", "targetHandle": "data"}, {"id": "inventory->reports_excel:data", "source": "inventory", "target": "reports_excel", "targetHandle": "data"}, {"id": "request->reports_excel:data", "source": "request", "target": "reports_excel", "targetHandle": "data"}, {"id": "material_assignment->reports_excel:data", "source": "material_assignment", "target": "reports_excel", "targetHandle": "data"}, {"id": "consumption_tracking->reports_excel:data", "source": "consumption_tracking", "target": "reports_excel", "targetHandle": "data"}], "pages": [{"icon": "Users", "path": "team", "title": "Team", "hidden": false, "module": "user_management"}, {"icon": "Boxes", "path": "inventory", "title": "Inventory", "hidden": false, "module": "inventory"}, {"icon": "FilePlus2", "path": "requests", "title": "Requests", "hidden": false, "module": "request"}, {"icon": "ClipboardList", "path": "assignments", "title": "Assignments", "hidden": false, "module": "assignment_frontend"}, {"icon": "Activity", "path": "consumption", "title": "Consumption", "hidden": false, "module": "consumption_tracking"}, {"icon": "BarChart3", "path": "analytics", "title": "Analytics", "hidden": false, "module": "analytics"}, {"icon": "FileSpreadsheet", "path": "reports", "title": "Reports", "hidden": false, "module": "reports_excel"}], "roles": {"admin": {"label": "Distribution head"}, "member": {"label": "Field staff"}, "manager": {"label": "Dispatcher"}}, "theme": {"bg": "#12101F", "ink": "#EDEBFA", "font": "mono", "mode": "dark", "accent": "#22D3EE", "layout": "rail", "radius": 10, "shadow": "flat", "density": "compact", "heading": "normal", "primary": "#8B5CF6", "surface": "#1C1930"}, "modules": [{"id": "auth_rbac", "type": "auth_rbac", "config": {}, "position": {"x": 0, "y": 0}}, {"id": "dashboard_shell", "type": "dashboard_shell", "config": {}, "position": {"x": 0, "y": 130}}, {"id": "user_management", "type": "user_management", "config": {}, "position": {"x": 0, "y": 260}}, {"id": "inventory", "type": "inventory", "config": {"fields": [{"key": "sku", "core": true, "type": "text", "label": "Item code", "required": true}, {"key": "name", "core": true, "type": "text", "label": "Material", "required": true}, {"key": "category", "core": true, "type": "text", "label": "Group"}, {"key": "qty", "min": 0, "core": true, "type": "number", "label": "Available", "default": 0, "required": true}, {"key": "price", "min": 0, "core": true, "type": "currency", "label": "Rate", "default": 0}, {"key": "reorder_level", "min": 0, "core": true, "type": "number", "label": "Min level", "default": 0}, {"key": "uom", "type": "select", "label": "Unit", "options": ["pcs", "m", "kg", "box"]}, {"key": "total", "type": "currency", "label": "Value", "formula": "qty * price"}], "lowStockAlerts": true}, "position": {"x": 290, "y": 0}}, {"id": "request", "type": "request", "config": {"fields": [{"key": "title", "core": true, "type": "text", "label": "What is needed", "required": true}, {"key": "item_id", "ref": "components", "core": true, "type": "ref", "label": "Material"}, {"key": "qty", "min": 1, "core": true, "type": "number", "label": "Qty", "default": 1, "required": true}, {"key": "priority", "core": true, "type": "select", "label": "Priority", "default": "normal", "options": ["low", "normal", "high", "urgent"]}, {"key": "notes", "core": true, "type": "textarea", "label": "Notes"}, {"key": "field_site", "type": "text", "label": "Field site", "required": true}, {"key": "needed_by", "type": "date", "label": "Needed by"}], "numberPrefix": "DR", "publicIntake": false}, "position": {"x": 290, "y": 170}}, {"id": "material_assignment", "type": "material_assignment", "config": {"fields": [{"key": "qty", "min": 0.01, "core": true, "type": "number", "label": "Qty to issue", "required": true}, {"key": "assigned_to", "core": true, "type": "text", "label": "Issued to", "required": true}, {"key": "vehicle_no", "type": "text", "label": "Vehicle no."}], "allowPartialQty": true, "autoAssignOnApproval": false}, "position": {"x": 870, "y": 60}}, {"id": "assignment_frontend", "type": "assignment_frontend", "config": {}, "position": {"x": 1160, "y": 60}}, {"id": "consumption_tracking", "type": "consumption_tracking", "config": {}, "position": {"x": 1160, "y": 200}}, {"id": "analytics", "type": "analytics", "config": {"widgets": ["kpis", "requests_by_status", "assignments_trend", "consumption_by_item", "low_stock"]}, "position": {"x": 580, "y": 340}}, {"id": "reports_excel", "type": "reports_excel", "config": {}, "position": {"x": 580, "y": 470}}], "tagline": "Issue material and track field consumption."}	Initial release	1	2026-10-14 03:14:31.309889+00
\.


--
-- Data for Name: sites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sites (id, slug, name, tagline, theme, draft_config, published_version_id, is_active, created_at, updated_at) FROM stdin;
1	central-stores	Central Stores	Inventory, stock control and analytics.	{"bg": "#F4F1E8", "ink": "#0D1621", "font": "grotesk", "mode": "light", "accent": "#1D4FB5", "layout": "sidebar", "radius": 4, "shadow": "hard", "density": "comfortable", "heading": "display", "primary": "#FFDD0A", "surface": "#FFFFFF"}	{"name": "Central Stores", "slug": "central-stores", "edges": [{"id": "inventory->analytics:data", "source": "inventory", "target": "analytics", "targetHandle": "data"}, {"id": "inventory->reports_excel:data", "source": "inventory", "target": "reports_excel", "targetHandle": "data"}], "pages": [{"icon": "Users", "path": "team", "title": "Team", "hidden": false, "module": "user_management"}, {"icon": "Boxes", "path": "inventory", "title": "Inventory", "hidden": false, "module": "inventory"}, {"icon": "BarChart3", "path": "analytics", "title": "Analytics", "hidden": false, "module": "analytics"}, {"icon": "FileSpreadsheet", "path": "reports", "title": "Reports", "hidden": false, "module": "reports_excel"}], "roles": {"admin": {"label": "Stores head"}, "member": {"label": "Store clerk"}, "manager": {"label": "Store keeper"}}, "theme": {"bg": "#F4F1E8", "ink": "#0D1621", "font": "grotesk", "mode": "light", "accent": "#1D4FB5", "layout": "sidebar", "radius": 4, "shadow": "hard", "density": "comfortable", "heading": "display", "primary": "#FFDD0A", "surface": "#FFFFFF"}, "modules": [{"id": "auth_rbac", "type": "auth_rbac", "config": {}, "position": {"x": 0, "y": 0}}, {"id": "dashboard_shell", "type": "dashboard_shell", "config": {}, "position": {"x": 0, "y": 130}}, {"id": "user_management", "type": "user_management", "config": {}, "position": {"x": 0, "y": 260}}, {"id": "inventory", "type": "inventory", "config": {"fields": [{"key": "sku", "core": true, "type": "text", "label": "SKU", "required": true}, {"key": "name", "core": true, "type": "text", "label": "Component", "required": true}, {"key": "category", "core": true, "type": "text", "label": "Category"}, {"key": "qty", "min": 0, "core": true, "type": "number", "label": "On hand", "default": 0, "required": true}, {"key": "price", "min": 0, "core": true, "type": "currency", "label": "Unit price", "default": 0}, {"key": "reorder_level", "min": 0, "core": true, "type": "number", "label": "Reorder at", "default": 0}, {"key": "supplier", "type": "text", "label": "Supplier"}, {"key": "location", "type": "text", "label": "Rack / bin"}, {"key": "total", "help": "TOTAL = QTY x PRICE", "type": "currency", "label": "TOTAL", "formula": "qty * price"}, {"key": "shortfall", "help": "How many units below the reorder level", "type": "number", "label": "Shortfall", "formula": "MAX(reorder_level - qty, 0)"}], "lowStockAlerts": true}, "position": {"x": 290, "y": 0}}, {"id": "analytics", "type": "analytics", "config": {"widgets": ["kpis", "stock_by_category", "low_stock", "consumption_by_item"]}, "position": {"x": 580, "y": 340}}, {"id": "reports_excel", "type": "reports_excel", "config": {"permissions": {"export": "manager", "import": "admin"}}, "position": {"x": 580, "y": 470}}], "tagline": "Inventory, stock control and analytics."}	1	t	2026-10-14 03:14:31.285218+00	2026-10-14 03:14:31.289932+00
2	service-centre	Service Centre	Requests, approvals, repairs and returns.	{"bg": "#F2F7F6", "ink": "#10302C", "font": "serif", "mode": "light", "accent": "#E4572E", "layout": "topnav", "radius": 14, "shadow": "soft", "density": "comfortable", "heading": "normal", "primary": "#0E9F8E", "surface": "#FFFFFF"}	{"name": "Service Centre", "slug": "service-centre", "edges": [{"id": "inventory->request:stock", "source": "inventory", "target": "request", "targetHandle": "stock"}, {"id": "request->approval:request", "source": "request", "target": "approval", "targetHandle": "request"}, {"id": "approval->pcb_repair:request", "source": "approval", "target": "pcb_repair", "targetHandle": "request"}, {"id": "inventory->pcb_repair:stock", "source": "inventory", "target": "pcb_repair", "targetHandle": "stock"}, {"id": "pcb_repair->return_management:source", "source": "pcb_repair", "target": "return_management", "targetHandle": "source"}, {"id": "inventory->return_management:stock", "source": "inventory", "target": "return_management", "targetHandle": "stock"}, {"id": "inventory->analytics:data", "source": "inventory", "target": "analytics", "targetHandle": "data"}, {"id": "approval->analytics:data", "source": "approval", "target": "analytics", "targetHandle": "data"}, {"id": "return_management->analytics:data", "source": "return_management", "target": "analytics", "targetHandle": "data"}, {"id": "pcb_repair->analytics:data", "source": "pcb_repair", "target": "analytics", "targetHandle": "data"}, {"id": "inventory->reports_excel:data", "source": "inventory", "target": "reports_excel", "targetHandle": "data"}, {"id": "approval->reports_excel:data", "source": "approval", "target": "reports_excel", "targetHandle": "data"}, {"id": "return_management->reports_excel:data", "source": "return_management", "target": "reports_excel", "targetHandle": "data"}, {"id": "pcb_repair->reports_excel:data", "source": "pcb_repair", "target": "reports_excel", "targetHandle": "data"}], "pages": [{"icon": "Users", "path": "team", "title": "Team", "hidden": false, "module": "user_management"}, {"icon": "Boxes", "path": "inventory", "title": "Inventory", "hidden": false, "module": "inventory"}, {"icon": "FilePlus2", "path": "requests", "title": "Requests", "hidden": false, "module": "request"}, {"icon": "Stamp", "path": "approvals", "title": "Approvals", "hidden": false, "module": "approval"}, {"icon": "CircuitBoard", "path": "repairs", "title": "Repairs", "hidden": false, "module": "pcb_repair"}, {"icon": "Undo2", "path": "returns", "title": "Returns", "hidden": false, "module": "return_management"}, {"icon": "BarChart3", "path": "analytics", "title": "Analytics", "hidden": false, "module": "analytics"}, {"icon": "FileSpreadsheet", "path": "reports", "title": "Reports", "hidden": false, "module": "reports_excel"}], "roles": {"admin": {"label": "Centre admin"}, "member": {"label": "Technician"}, "manager": {"label": "Service manager"}}, "theme": {"bg": "#F2F7F6", "ink": "#10302C", "font": "serif", "mode": "light", "accent": "#E4572E", "layout": "topnav", "radius": 14, "shadow": "soft", "density": "comfortable", "heading": "normal", "primary": "#0E9F8E", "surface": "#FFFFFF"}, "modules": [{"id": "auth_rbac", "type": "auth_rbac", "config": {}, "position": {"x": 0, "y": 0}}, {"id": "dashboard_shell", "type": "dashboard_shell", "config": {}, "position": {"x": 0, "y": 130}}, {"id": "user_management", "type": "user_management", "config": {}, "position": {"x": 0, "y": 260}}, {"id": "inventory", "type": "inventory", "config": {"fields": [{"key": "sku", "core": true, "type": "text", "label": "Part no.", "required": true}, {"key": "name", "core": true, "type": "text", "label": "Spare part", "required": true}, {"key": "category", "core": true, "type": "text", "label": "Part type"}, {"key": "qty", "min": 0, "core": true, "type": "number", "label": "In stock", "default": 0, "required": true}, {"key": "price", "min": 0, "core": true, "type": "currency", "label": "Cost", "default": 0}, {"key": "reorder_level", "min": 0, "core": true, "type": "number", "label": "Reorder level", "default": 0}, {"key": "total", "type": "currency", "label": "Stock value", "formula": "qty * price"}], "lowStockAlerts": true}, "position": {"x": 290, "y": 0}}, {"id": "request", "type": "request", "config": {"fields": [{"key": "title", "core": true, "type": "text", "label": "Problem summary", "required": true}, {"key": "item_id", "ref": "components", "core": true, "type": "ref", "label": "Component", "hidden": true}, {"key": "qty", "min": 1, "core": true, "type": "number", "label": "Qty", "hidden": true, "default": 1, "required": true}, {"key": "priority", "core": true, "type": "select", "label": "Priority", "default": "normal", "options": ["low", "normal", "high", "urgent"]}, {"key": "notes", "core": true, "type": "textarea", "label": "Notes"}, {"key": "customer_name", "type": "text", "label": "Customer name", "required": true}, {"key": "customer_phone", "type": "text", "label": "Phone"}, {"key": "device_type", "type": "select", "label": "Device type", "options": ["Laptop", "Phone", "TV", "Mainboard", "Other"]}, {"key": "warranty", "type": "boolean", "label": "In warranty?"}, {"key": "purchase_date", "type": "date", "label": "Purchase date"}], "numberPrefix": "SC", "publicIntake": true}, "position": {"x": 290, "y": 170}}, {"id": "approval", "type": "approval", "config": {"levels": [{"role": "manager", "label": "Estimate approval"}], "requireComment": true, "allowSelfApproval": false}, "position": {"x": 580, "y": 170}}, {"id": "pcb_repair", "type": "pcb_repair", "config": {"fields": [{"key": "device", "core": true, "type": "text", "label": "Device / board", "required": true}, {"key": "fault", "core": true, "type": "textarea", "label": "Reported fault", "required": true}, {"key": "labour_cost", "min": 0, "core": true, "type": "currency", "label": "Labour", "default": 0}, {"key": "parts_cost", "core": true, "type": "currency", "label": "Parts", "system": true}, {"key": "board_serial", "type": "text", "label": "Board serial"}, {"key": "estimated_days", "min": 0, "type": "number", "label": "Estimated days"}, {"key": "total_cost", "type": "currency", "label": "Subtotal", "formula": "labour_cost + parts_cost"}, {"key": "gst", "type": "currency", "label": "GST 18%", "formula": "ROUND(total_cost * 0.18, 2)"}, {"key": "grand_total", "type": "currency", "label": "Grand total", "formula": "total_cost + gst"}], "statuses": ["diagnosing", "awaiting_parts", "repairing", "testing", "completed"]}, "position": {"x": 870, "y": 290}}, {"id": "return_management", "type": "return_management", "config": {"restockGood": false}, "position": {"x": 1160, "y": 340}}, {"id": "analytics", "type": "analytics", "config": {"widgets": ["kpis", "requests_by_status", "requests_trend", "repair_status"]}, "position": {"x": 580, "y": 340}}, {"id": "reports_excel", "type": "reports_excel", "config": {}, "position": {"x": 580, "y": 470}}], "tagline": "Requests, approvals, repairs and returns."}	2	t	2026-10-14 03:14:31.299041+00	2026-10-14 03:14:31.300928+00
3	distribution	Distribution	Issue material and track field consumption.	{"bg": "#12101F", "ink": "#EDEBFA", "font": "mono", "mode": "dark", "accent": "#22D3EE", "layout": "rail", "radius": 10, "shadow": "flat", "density": "compact", "heading": "normal", "primary": "#8B5CF6", "surface": "#1C1930"}	{"name": "Distribution", "slug": "distribution", "edges": [{"id": "inventory->request:stock", "source": "inventory", "target": "request", "targetHandle": "stock"}, {"id": "request->material_assignment:request", "source": "request", "target": "material_assignment", "targetHandle": "request"}, {"id": "inventory->material_assignment:stock", "source": "inventory", "target": "material_assignment", "targetHandle": "stock"}, {"id": "material_assignment->assignment_frontend:assignment", "source": "material_assignment", "target": "assignment_frontend", "targetHandle": "assignment"}, {"id": "material_assignment->consumption_tracking:assignment", "source": "material_assignment", "target": "consumption_tracking", "targetHandle": "assignment"}, {"id": "inventory->analytics:data", "source": "inventory", "target": "analytics", "targetHandle": "data"}, {"id": "request->analytics:data", "source": "request", "target": "analytics", "targetHandle": "data"}, {"id": "material_assignment->analytics:data", "source": "material_assignment", "target": "analytics", "targetHandle": "data"}, {"id": "consumption_tracking->analytics:data", "source": "consumption_tracking", "target": "analytics", "targetHandle": "data"}, {"id": "inventory->reports_excel:data", "source": "inventory", "target": "reports_excel", "targetHandle": "data"}, {"id": "request->reports_excel:data", "source": "request", "target": "reports_excel", "targetHandle": "data"}, {"id": "material_assignment->reports_excel:data", "source": "material_assignment", "target": "reports_excel", "targetHandle": "data"}, {"id": "consumption_tracking->reports_excel:data", "source": "consumption_tracking", "target": "reports_excel", "targetHandle": "data"}], "pages": [{"icon": "Users", "path": "team", "title": "Team", "hidden": false, "module": "user_management"}, {"icon": "Boxes", "path": "inventory", "title": "Inventory", "hidden": false, "module": "inventory"}, {"icon": "FilePlus2", "path": "requests", "title": "Requests", "hidden": false, "module": "request"}, {"icon": "ClipboardList", "path": "assignments", "title": "Assignments", "hidden": false, "module": "assignment_frontend"}, {"icon": "Activity", "path": "consumption", "title": "Consumption", "hidden": false, "module": "consumption_tracking"}, {"icon": "BarChart3", "path": "analytics", "title": "Analytics", "hidden": false, "module": "analytics"}, {"icon": "FileSpreadsheet", "path": "reports", "title": "Reports", "hidden": false, "module": "reports_excel"}], "roles": {"admin": {"label": "Distribution head"}, "member": {"label": "Field staff"}, "manager": {"label": "Dispatcher"}}, "theme": {"bg": "#12101F", "ink": "#EDEBFA", "font": "mono", "mode": "dark", "accent": "#22D3EE", "layout": "rail", "radius": 10, "shadow": "flat", "density": "compact", "heading": "normal", "primary": "#8B5CF6", "surface": "#1C1930"}, "modules": [{"id": "auth_rbac", "type": "auth_rbac", "config": {}, "position": {"x": 0, "y": 0}}, {"id": "dashboard_shell", "type": "dashboard_shell", "config": {}, "position": {"x": 0, "y": 130}}, {"id": "user_management", "type": "user_management", "config": {}, "position": {"x": 0, "y": 260}}, {"id": "inventory", "type": "inventory", "config": {"fields": [{"key": "sku", "core": true, "type": "text", "label": "Item code", "required": true}, {"key": "name", "core": true, "type": "text", "label": "Material", "required": true}, {"key": "category", "core": true, "type": "text", "label": "Group"}, {"key": "qty", "min": 0, "core": true, "type": "number", "label": "Available", "default": 0, "required": true}, {"key": "price", "min": 0, "core": true, "type": "currency", "label": "Rate", "default": 0}, {"key": "reorder_level", "min": 0, "core": true, "type": "number", "label": "Min level", "default": 0}, {"key": "uom", "type": "select", "label": "Unit", "options": ["pcs", "m", "kg", "box"]}, {"key": "total", "type": "currency", "label": "Value", "formula": "qty * price"}], "lowStockAlerts": true}, "position": {"x": 290, "y": 0}}, {"id": "request", "type": "request", "config": {"fields": [{"key": "title", "core": true, "type": "text", "label": "What is needed", "required": true}, {"key": "item_id", "ref": "components", "core": true, "type": "ref", "label": "Material"}, {"key": "qty", "min": 1, "core": true, "type": "number", "label": "Qty", "default": 1, "required": true}, {"key": "priority", "core": true, "type": "select", "label": "Priority", "default": "normal", "options": ["low", "normal", "high", "urgent"]}, {"key": "notes", "core": true, "type": "textarea", "label": "Notes"}, {"key": "field_site", "type": "text", "label": "Field site", "required": true}, {"key": "needed_by", "type": "date", "label": "Needed by"}], "numberPrefix": "DR", "publicIntake": false}, "position": {"x": 290, "y": 170}}, {"id": "material_assignment", "type": "material_assignment", "config": {"fields": [{"key": "qty", "min": 0.01, "core": true, "type": "number", "label": "Qty to issue", "required": true}, {"key": "assigned_to", "core": true, "type": "text", "label": "Issued to", "required": true}, {"key": "vehicle_no", "type": "text", "label": "Vehicle no."}], "allowPartialQty": true, "autoAssignOnApproval": false}, "position": {"x": 870, "y": 60}}, {"id": "assignment_frontend", "type": "assignment_frontend", "config": {}, "position": {"x": 1160, "y": 60}}, {"id": "consumption_tracking", "type": "consumption_tracking", "config": {}, "position": {"x": 1160, "y": 200}}, {"id": "analytics", "type": "analytics", "config": {"widgets": ["kpis", "requests_by_status", "assignments_trend", "consumption_by_item", "low_stock"]}, "position": {"x": 580, "y": 340}}, {"id": "reports_excel", "type": "reports_excel", "config": {}, "position": {"x": 580, "y": 470}}], "tagline": "Issue material and track field consumption."}	3	t	2026-10-14 03:14:31.308296+00	2026-10-14 03:14:31.309889+00
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_movements (id, site_id, item_id, delta, balance, reason, ref_type, ref_id, actor_id, created_at) FROM stdin;
1	1	1	12000.00	12000.00	receipt	item	1	\N	2026-09-14 03:14:31.321+00
2	1	2	8000.00	8000.00	receipt	item	2	\N	2026-09-15 03:14:31.323+00
3	1	3	15000.00	15000.00	receipt	item	3	\N	2026-09-16 03:14:31.324+00
4	1	4	900.00	900.00	receipt	item	4	\N	2026-09-17 03:14:31.325+00
5	1	5	240.00	240.00	receipt	item	5	\N	2026-09-18 03:14:31.326+00
6	1	6	60.00	60.00	receipt	item	6	\N	2026-09-19 03:14:31.329+00
7	1	7	410.00	410.00	receipt	item	7	\N	2026-09-20 03:14:31.348+00
8	1	8	520.00	520.00	receipt	item	8	\N	2026-09-21 03:14:31.349+00
9	1	9	330.00	330.00	receipt	item	9	\N	2026-09-22 03:14:31.351+00
10	1	10	85.00	85.00	receipt	item	10	\N	2026-09-23 03:14:31.352+00
11	1	11	4000.00	4000.00	receipt	item	11	\N	2026-09-24 03:14:31.353+00
12	1	12	35.00	35.00	receipt	item	12	\N	2026-09-25 03:14:31.354+00
13	1	13	150.00	150.00	receipt	item	13	\N	2026-09-26 03:14:31.355+00
14	1	14	700.00	700.00	receipt	item	14	\N	2026-09-27 03:14:31.355+00
15	1	6	-20.00	40.00	adjustment	\N	\N	2	2026-10-14 03:14:31.357132+00
16	1	3	5000.00	20000.00	receipt	\N	\N	2	2026-10-14 03:14:31.357132+00
17	2	15	14.00	14.00	receipt	item	15	\N	2026-09-14 03:14:31.361+00
18	2	16	22.00	22.00	receipt	item	16	\N	2026-09-15 03:14:31.362+00
19	2	17	40.00	40.00	receipt	item	17	\N	2026-09-16 03:14:31.363+00
20	2	18	6.00	6.00	receipt	item	18	\N	2026-09-17 03:14:31.364+00
21	2	19	120.00	120.00	receipt	item	19	\N	2026-09-18 03:14:31.364+00
22	2	20	55.00	55.00	receipt	item	20	\N	2026-09-19 03:14:31.365+00
23	2	21	3.00	3.00	receipt	item	21	\N	2026-09-20 03:14:31.366+00
24	2	22	60.00	60.00	receipt	item	22	\N	2026-09-21 03:14:31.367+00
25	2	17	-1.00	39.00	repair_part	repair	1	5	2026-10-14 03:14:31.3683+00
26	2	20	-2.00	53.00	repair_part	repair	1	5	2026-10-14 03:14:31.3683+00
27	2	15	-1.00	13.00	repair_part	repair	2	5	2026-10-14 03:14:31.3683+00
28	2	21	-1.00	2.00	repair_part	repair	3	5	2026-10-14 03:14:31.3683+00
29	2	16	-1.00	21.00	repair_part	repair	4	5	2026-10-14 03:14:31.3683+00
30	3	23	400.00	400.00	receipt	item	23	\N	2026-09-14 03:14:31.419+00
31	3	24	18.00	18.00	receipt	item	24	\N	2026-09-15 03:14:31.42+00
32	3	25	1500.00	1500.00	receipt	item	25	\N	2026-09-16 03:14:31.422+00
33	3	26	70.00	70.00	receipt	item	26	\N	2026-09-17 03:14:31.423+00
34	3	27	300.00	300.00	receipt	item	27	\N	2026-09-18 03:14:31.423+00
35	3	28	900.00	900.00	receipt	item	28	\N	2026-09-19 03:14:31.424+00
36	3	29	22.00	22.00	receipt	item	29	\N	2026-09-20 03:14:31.425+00
37	3	30	110.00	110.00	receipt	item	30	\N	2026-09-21 03:14:31.426+00
38	3	24	-4.00	14.00	assignment	assignment	1	6	2026-10-14 03:14:31.427964+00
39	3	25	-300.00	1200.00	assignment	assignment	2	6	2026-10-14 03:14:31.427964+00
40	3	26	-20.00	50.00	assignment	assignment	3	6	2026-10-14 03:14:31.427964+00
41	3	30	-40.00	70.00	assignment	assignment	4	6	2026-10-14 03:14:31.427964+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, name, password_hash, hub_role, is_active, created_at) FROM stdin;
1	admin@opshub.dev	Priya Menon (Hub Admin)	$2b$10$n9JMoyU7/q6pNzZpDb31L.1fLZU4y/YRnBvoclF2heN177JIV4/5i	admin	t	2026-10-14 03:14:30.904522+00
2	stores@opshub.dev	Rahul Sharma	$2b$10$paya/Jh0UN0sjrLqjU1hOuRRHNTAvQq6EfB595XYkrN5dT5kx3oAu	user	t	2026-10-14 03:14:30.967986+00
3	storeadmin@opshub.dev	Kavita Nair	$2b$10$vms4NKsCuPL748gEXVxLiO8e8g6wjuu9zXyDfnTUXEB0foPWEv7ZG	user	t	2026-10-14 03:14:31.030527+00
4	servicemgr@opshub.dev	Anita Desai	$2b$10$zRvdnowIh8rXxOcCs8M.x.ifdwJCzzpj1ZW6350.jWDEHrVwE7Wyu	user	t	2026-10-14 03:14:31.093205+00
5	tech@opshub.dev	Vikram Rao	$2b$10$Kf6awPFSherJCRtWhmKiMe4rI28v3wbG2Y4Ba2wZnzjwE.2oV4okK	user	t	2026-10-14 03:14:31.155598+00
6	dispatch@opshub.dev	Meera Iyer	$2b$10$MBqmgjUX6DBlKHo2nttkLOWifUGDoT97kko5V8UClKx1TS/nkCkPa	user	t	2026-10-14 03:14:31.217925+00
7	field@opshub.dev	Arjun Patil	$2b$10$U/nJWgsz4gFBrxtBlGcmR.a2GkhGyeT71J1YX.N1QvLXAjbSCajsK	user	t	2026-10-14 03:14:31.28093+00
\.


--
-- Name: approvals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.approvals_id_seq', 8, true);


--
-- Name: assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.assignments_id_seq', 4, true);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 4, true);


--
-- Name: consumption_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.consumption_logs_id_seq', 5, true);


--
-- Name: deploy_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.deploy_history_id_seq', 3, true);


--
-- Name: inventory_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_items_id_seq', 30, true);


--
-- Name: repair_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.repair_jobs_id_seq', 4, true);


--
-- Name: repair_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.repair_logs_id_seq', 15, true);


--
-- Name: requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.requests_id_seq', 15, true);


--
-- Name: returns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.returns_id_seq', 1, true);


--
-- Name: site_versions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.site_versions_id_seq', 3, true);


--
-- Name: sites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sites_id_seq', 3, true);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_movements_id_seq', 41, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 7, true);


--
-- Name: approvals approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);


--
-- Name: approvals approvals_site_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_site_id_id_key UNIQUE (site_id, id);


--
-- Name: approvals approvals_site_id_request_id_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_site_id_request_id_level_key UNIQUE (site_id, request_id, level);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_site_id_asg_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_site_id_asg_no_key UNIQUE (site_id, asg_no);


--
-- Name: assignments assignments_site_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_site_id_id_key UNIQUE (site_id, id);


--
-- Name: assignments assignments_site_id_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_site_id_request_id_key UNIQUE (site_id, request_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: consumption_logs consumption_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_logs
    ADD CONSTRAINT consumption_logs_pkey PRIMARY KEY (id);


--
-- Name: deploy_history deploy_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_history
    ADD CONSTRAINT deploy_history_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_site_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_site_id_id_key UNIQUE (site_id, id);


--
-- Name: inventory_items inventory_items_site_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_site_id_sku_key UNIQUE (site_id, sku);


--
-- Name: repair_jobs repair_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_pkey PRIMARY KEY (id);


--
-- Name: repair_jobs repair_jobs_site_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_site_id_id_key UNIQUE (site_id, id);


--
-- Name: repair_jobs repair_jobs_site_id_job_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_site_id_job_no_key UNIQUE (site_id, job_no);


--
-- Name: repair_jobs repair_jobs_site_id_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_site_id_request_id_key UNIQUE (site_id, request_id);


--
-- Name: repair_logs repair_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_logs
    ADD CONSTRAINT repair_logs_pkey PRIMARY KEY (id);


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- Name: requests requests_site_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_site_id_id_key UNIQUE (site_id, id);


--
-- Name: requests requests_site_id_req_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_site_id_req_no_key UNIQUE (site_id, req_no);


--
-- Name: returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_pkey PRIMARY KEY (id);


--
-- Name: returns returns_site_id_ret_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_site_id_ret_no_key UNIQUE (site_id, ret_no);


--
-- Name: site_counters site_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_counters
    ADD CONSTRAINT site_counters_pkey PRIMARY KEY (site_id, name);


--
-- Name: site_members site_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_members
    ADD CONSTRAINT site_members_pkey PRIMARY KEY (site_id, user_id);


--
-- Name: site_versions site_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_versions
    ADD CONSTRAINT site_versions_pkey PRIMARY KEY (id);


--
-- Name: site_versions site_versions_site_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_versions
    ADD CONSTRAINT site_versions_site_id_version_key UNIQUE (site_id, version);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: sites sites_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_slug_key UNIQUE (slug);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_asg_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asg_site ON public.assignments USING btree (site_id);


--
-- Name: idx_cons_asg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cons_asg ON public.consumption_logs USING btree (site_id, assignment_id);


--
-- Name: idx_items_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_site ON public.inventory_items USING btree (site_id);


--
-- Name: idx_moves_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moves_item ON public.stock_movements USING btree (site_id, item_id);


--
-- Name: idx_repair_site_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repair_site_status ON public.repair_jobs USING btree (site_id, status);


--
-- Name: idx_req_site_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_req_site_status ON public.requests USING btree (site_id, status);


--
-- Name: users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower ON public.users USING btree (lower(email));


--
-- Name: approvals approvals_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id);


--
-- Name: approvals approvals_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: approvals approvals_site_id_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_site_id_request_id_fkey FOREIGN KEY (site_id, request_id) REFERENCES public.requests(site_id, id) ON DELETE CASCADE;


--
-- Name: assignments assignments_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: assignments assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assignments assignments_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_site_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_site_id_item_id_fkey FOREIGN KEY (site_id, item_id) REFERENCES public.inventory_items(site_id, id);


--
-- Name: assignments assignments_site_id_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_site_id_request_id_fkey FOREIGN KEY (site_id, request_id) REFERENCES public.requests(site_id, id);


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: audit_log audit_log_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: consumption_logs consumption_logs_site_id_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_logs
    ADD CONSTRAINT consumption_logs_site_id_assignment_id_fkey FOREIGN KEY (site_id, assignment_id) REFERENCES public.assignments(site_id, id) ON DELETE CASCADE;


--
-- Name: consumption_logs consumption_logs_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_logs
    ADD CONSTRAINT consumption_logs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: consumption_logs consumption_logs_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_logs
    ADD CONSTRAINT consumption_logs_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.users(id);


--
-- Name: deploy_history deploy_history_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_history
    ADD CONSTRAINT deploy_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: deploy_history deploy_history_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_history
    ADD CONSTRAINT deploy_history_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: inventory_items inventory_items_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: repair_jobs repair_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: repair_jobs repair_jobs_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: repair_jobs repair_jobs_site_id_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_site_id_request_id_fkey FOREIGN KEY (site_id, request_id) REFERENCES public.requests(site_id, id);


--
-- Name: repair_jobs repair_jobs_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_jobs
    ADD CONSTRAINT repair_jobs_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.users(id);


--
-- Name: repair_logs repair_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_logs
    ADD CONSTRAINT repair_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: repair_logs repair_logs_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_logs
    ADD CONSTRAINT repair_logs_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: repair_logs repair_logs_site_id_repair_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_logs
    ADD CONSTRAINT repair_logs_site_id_repair_id_fkey FOREIGN KEY (site_id, repair_id) REFERENCES public.repair_jobs(site_id, id) ON DELETE CASCADE;


--
-- Name: requests requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id);


--
-- Name: requests requests_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: requests requests_site_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_site_id_item_id_fkey FOREIGN KEY (site_id, item_id) REFERENCES public.inventory_items(site_id, id);


--
-- Name: returns returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: returns returns_site_id_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_site_id_assignment_id_fkey FOREIGN KEY (site_id, assignment_id) REFERENCES public.assignments(site_id, id);


--
-- Name: returns returns_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: returns returns_site_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_site_id_item_id_fkey FOREIGN KEY (site_id, item_id) REFERENCES public.inventory_items(site_id, id);


--
-- Name: returns returns_site_id_repair_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_site_id_repair_id_fkey FOREIGN KEY (site_id, repair_id) REFERENCES public.repair_jobs(site_id, id);


--
-- Name: site_counters site_counters_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_counters
    ADD CONSTRAINT site_counters_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_members site_members_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_members
    ADD CONSTRAINT site_members_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_members site_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_members
    ADD CONSTRAINT site_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: site_versions site_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_versions
    ADD CONSTRAINT site_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: site_versions site_versions_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_versions
    ADD CONSTRAINT site_versions_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: sites sites_published_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_published_fk FOREIGN KEY (published_version_id) REFERENCES public.site_versions(id);


--
-- Name: stock_movements stock_movements_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: stock_movements stock_movements_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_site_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_site_id_item_id_fkey FOREIGN KEY (site_id, item_id) REFERENCES public.inventory_items(site_id, id) ON DELETE CASCADE;


--
-- Name: approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: consumption_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumption_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repair_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repair_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

--
-- Name: returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

--
-- Name: site_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: approvals site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.approvals USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: assignments site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.assignments USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: audit_log site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.audit_log USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: consumption_logs site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.consumption_logs USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: inventory_items site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.inventory_items USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: repair_jobs site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.repair_jobs USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: repair_logs site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.repair_logs USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: requests site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.requests USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: returns site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.returns USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: site_counters site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.site_counters USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: stock_movements site_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_isolation ON public.stock_movements USING ((site_id = public.app_site_id())) WITH CHECK ((site_id = public.app_site_id()));


--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict PPssc7WvhRDvnTUj0earW28lb1nj25oXSnf4j3WMNp1OQVxe4MPYgl6ZFqgcemr

