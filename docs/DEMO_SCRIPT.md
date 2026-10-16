# Live demo script (about 6 minutes)

Start: `npm start` (or `npm run start:offline` as backup). Open http://localhost:4000.

1. **One login, three units.** Sign in as `admin@opshub.dev`. The hub shows Central Stores, Distribution and Service Centre, each with its own theme and layout and live stats. Open the switcher in any site to jump between them.
2. **Two different systems, one codebase.**
   * *Service Centre* (teal, top tabs): Requests -> Approvals -> Repairs kanban -> Returns. Open a repair, add a part (stock drops), move status.
   * *Central Stores* (navy sidebar): Inventory with calculated **TOTAL = QTY x PRICE** and Shortfall, Analytics, Reports.
   * Sign in as `tech@opshub.dev` to show roles: a technician cannot approve or export.
3. **Enable Returns on Distribution, no code changes.** Distribution has no Returns page. Builder -> Distribution -> click **+** on *Return Management* (it wires itself to Assignments) -> **Preview** (read-only draft) -> **Publish** -> reload `/s/distribution`: Returns is live. Show *Releases and rollback* and roll back, then forward.
   * Bonus: on a blank site try to add *Approval* first: it is refused ("needs Request").
4. **Excel with role restrictions.** `tech@opshub.dev` on Central Stores -> Reports: export is locked. `storeadmin@opshub.dev`: export `.xlsx` (formulas stay live), import a file with a bad row (rejected, nothing written), then import valid rows.
5. **Isolation proof.** Run `npm test` and show the isolation suite, or `curl` a Distribution id through Central Stores (404).

Fallbacks: `npm run start:offline` (in-process Postgres, seeded), `npm run restore` (snapshot), or `psql -f backup/opshub_demo.sql`.
