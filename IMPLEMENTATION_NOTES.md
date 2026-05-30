# Classic Trip dashboard completion pass

This pass keeps the existing Classic Trip architecture and upgrades the dashboard system end-to-end instead of replacing it with duplicate pages.

## Implemented across all dashboards

- Dashboard payloads are exposed to the browser as `window.__CT_DASHBOARD_DATA__` for reusable row metadata, modal details, exports, and filters.
- A shared dashboard enhancer (`public/js/full-dashboard-enhancer.js`) adds:
  - per-table search,
  - status filters,
  - date filter inputs,
  - CSV export of currently visible rows,
  - full record detail modals grouped by backend detail sections,
  - JSON export for individual records,
  - copy-reference actions,
  - disabled-state protection for UI actions that do not have a safe backend endpoint.
- Existing dashboard visuals are preserved; the enhancer augments tables/cards without replacing the UI.

## Backend/API additions

- `GET /api/dashboards/data`
- `GET /api/dashboards/:role/data`
- `POST /api/dashboards/actions/:action`
- Protected scanner endpoints:
  - `POST /api/scanner/lookup`
  - `POST /api/scanner/validate`
  - `POST /api/scanner/no-show`
- Employee/company no-show web actions:
  - `POST /employee/bookings/:bookingRef/no-show`
  - `POST /company/bookings/:bookingRef/no-show`

## Data/model additions

- `ShiftHandover` model for operational staff shift handovers.
- `SavedListing` model for customer saved trips/listings.
- `PlatformSetting` model for safe global platform settings.
- Existing rich schema fields for bookings/payments/users/companies/support/refunds/audit/settings/notifications remain in place.
- `demoStore` now includes richer metadata for customer and promoter dashboard rows, not only admin/company records.

## Scanner/check-in improvements

- Lookup can review full backend booking details before action.
- Check-in uses existing booking check-in lifecycle fields and persists when MongoDB is connected.
- No-show action added with backend validation.
- Scanner API is now protected by auth and dashboard roles.

## Verification run

- `npm install` completed.
- `npm run check` passed.
- `npm test` passed: 4 suites, 28 tests.
- `npm start` starts the server; MongoDB was unavailable in this environment, so the app continued using the in-memory demo store as designed.

## Notes

The project already contains extensive dashboard pages and controllers. This completion pass makes the pages richer and safer by adding a reusable full-details/filter/export/action layer and filling missing backend action/model gaps while preserving existing route conventions and visual design.
