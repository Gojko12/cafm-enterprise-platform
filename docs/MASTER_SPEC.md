@'
# Master System Specification: Enterprise CAFM, SmartPM & Workplace Platform (Google Cloud & Firebase Stack)

## 1. System Overview & Target Architecture
Build a full-stack, enterprise-grade Computer-Aided Facility Management (CAFM) and Preventive/Corrective Maintenance (SmartPM) platform consisting of a Responsive Back-Office Web Portal (for administrators, planners, and managers) and an Offline-First Mobile Application (for field technicians and QA inspectors).
- Frontend (Web & Mobile): Next.js (Web) + Flutter (Mobile).
- Backend & Offline Database: Google Firebase (Cloud Firestore with native offline persistence enabled, or Firebase Data Connect with Cloud SQL PostgreSQL + local SQLite sync for relational queries).
- Serverless Business Logic: Firebase Cloud Functions (TypeScript/Python) for bulk PM generation, DWG/BIM parsing, automated SLA/status calculations, and scheduled tasks.
- Storage: Google Cloud Storage for Firebase (equipment manuals, attached documents, DWG/DXF files, IFC/BIM models, and compressed inspection photos).
- Authentication & Security: Firebase Authentication with Custom Claims for granular Role-Based Access Control (RBAC).
- Analytics & Reporting: Native in-app interactive BI dashboards (charts, KPIs, pivot tables) backed by BigQuery Firebase Extension and Looker Studio / Power BI connector.

## 2. Spatial Hierarchy, DWG Room Area Extraction & BIM Integration
### 2.1 Location Hierarchy
- Three-Tier Structure: Building (bl_id, Name, Address, GPS Coordinates) -> Floor (LevelName, Floor Number, Gross Area in m2, associated 2D Floor Plan DWG/SVG) -> Room (RoomCode, Name, Room Category/Usage, Net Area in m2, Department/Cost Center).
- Cascading Filtering: Selecting a Building filters available Floors; selecting a Floor filters available Rooms; selecting a Room filters Equipment and Work Requests. Choosing a Room or Floor first automatically resolves and populates the parent Floor and Building.

### 2.2 Automated DWG Parsing & Interactive 2D Floor Plans
- DWG/DXF Upload & Area Extraction: Administrators upload CAD files (.dwg or .dxf) per Floor. A backend Cloud Function (using ezdxf / LibreDWG converter) parses closed polylines on designated room boundary layers and text/attribute tags (RoomCode), automatically calculating each room's exact net area in m2 and updating the Room records in the database.
- Interactive 2D Map Viewer: Convert DWG floor plans into interactive vector layers (SVG/GeoJSON/Canvas). Users can click any room polygon on the floor plan to view room metadata (m2, assigned equipment, active Work Requests, or desk availability) and visually highlight rooms with overdue WRs in red/orange.

### 2.3 BIM (Building Information Modeling) Integration
- 3D IFC Model Viewer: Support uploading and rendering .ifc (Industry Foundation Classes) 3D models per Building/Floor using an embedded WebGL/Three.js (web-ifc) canvas.
- Bidirectional Asset Linking: Map IFC GlobalId / Tag properties directly to EquipmentCode and RoomCode in the database. Clicking an HVAC unit, switchgear, or sensor in the 3D BIM viewer opens its Equipment profile, maintenance history, and active Work Requests.

## 3. Equipment (Asset) Management & QR Code Workflows
### 3.1 Equipment Registry
- Core Attributes: EquipmentCode (unique system ID, e.g., 0000000001), LocalEquipmentCode (client/site tag), EquipmentName (EquipmentUseEnglish), IsInstallation (Boolean), Status (Active, Decommissioned, Under Repair), Manufacturer, Model, SerialNumber, InstallationDate, WarrantyExpiryDate, Criticality, and TechnicalSpecifications (custom key-value pairs).
- Associations: Linked to Room (with automatic inheritance of Floor and Building), primary Trade (e.g., 02-Electrical, HVAC, Plumbing), ParentEquipment (for sub-assemblies), and BIM_GlobalId.

### 3.2 QR Code Generation & Mobile Scanning
- Batch QR Label Printing: Generate printable PDF sheets of QR codes containing the EquipmentCode and human-readable label.
- Mobile QR Scanner (ScanEquipmentQR): Technicians scan an equipment QR code using the mobile camera:
  - Immediately opens the Equipment Inspection View (offline-capable).
  - Shows equipment specs, location (bl_id / LevelName / RoomCode), open Work Requests for that asset, and historical completed WRs.
  - Provides one-tap actions: Start Assigned PM, Create Fast Job (FJ), Create Long Job (LJ), or Log Technical Audit / QA Inspection.

## 4. Work Request (WR) Engine: PMs, Long Jobs (LJ), and Fast Jobs (FJ)
### 4.1 Shared Base Work Request (BaseWorkRequest) Architecture
All work order types share a common base structure with unified tracking:
- Identifiers: WR_ID (formatted auto-sequence, e.g., 2026000001), JobID, TicketSequence.
- Core Fields: WR_Type (PM, LJ, FJ), ESAWorkType (e.g., Preventive Maintenance, Corrective Maintenance), Description, ProblemLocation, Trade (TradeName), ExpectedHours, TotalTimeMinutes.
- Key Dates: CreatedDate, StartDate (Date To Perform), StartDateTBD (Boolean), DueDate, and MarginDate (latest permissible tolerance date before SLA breach).
- Percentage-Driven Status Engine (WR_Statuses): Central configurable status table mapping WorkRequestStatus, WorkRequestSubstatus, Percentage (e.g., 50% = Issued, 78% = Technically Completed, 100% = Closed/Approved), and ESAWorkType.

### 4.2 Preventive Maintenance (SmartPM) & Schedules (PMS)
- Checklist Standards (Blueprints): Reusable maintenance templates (ChecklistCode, Title, MaintenanceReason, Trade, ExpectedHours) containing ordered step definitions (PM_ScheduleStep).
- PM Schedules (PM_Schedule): Links a Blueprint to specific Equipment (or bulk locations) with frequency rules (Daily, Weekly, Monthly, Quarterly, Yearly, or Meter-based), lead-time days, and margin window.
- Schedule Operations:
  - Bulk Create PMS & Bulk Assign: Assign a blueprint to multiple Equipment items or Locations simultaneously.
  - Generate WRs (Single, Selected, or Next 30 Days Horizon): Automated engine that checks for existing cycle WRs (preventing duplicates), resolves location hierarchy (Equipment -> Room -> Floor -> Building), assigns the 50% Issued status, and instantiates all PM_WorkRequestStep and PM_StepOption records.
  - Overrule Issued WRs & Switch Blueprint: Admin actions to cancel/supersede open issued PM WRs or migrate a schedule to an updated checklist blueprint.

### 4.3 Long Jobs (LJ - Complex Corrective & Minor Projects)
- Designed for multi-day repairs, refurbishments, and engineering modifications:
  - Lifecycle Options: Request Creation -> Technical Assessment & Cost/Hours Estimation -> Quote/Budget Approval -> Parts Ordering & Hold/Freeze Management (ActiveFreezeName, PlannedFreezeText when waiting for spare parts or shutdown windows) -> Multi-Craft Execution -> Technical Completion (78%) -> Manager Sign-Off (100%).
  - Sub-Tasks & Labor/Parts Tracking: Log multiple craftspeople hours, spare parts consumed, external contractor invoices, and KPI delay reasons.

### 4.4 Fast Jobs (FJ - Rapid Reactive Maintenance)
- Streamlined 30-second workflow for technicians or helpdesk operators to log and close minor on-the-spot repairs (e.g., replacing a lamp, resetting a breaker, fixing a door closer):
  - Scan QR or pick Room -> Enter brief description & photo -> Log time spent -> Mark Technically Completed in a single screen.

## 5. Checklists, Work Sessions & QA Technical Audits
### 5.1 Dynamic SmartPM Checklists (PM_WorkRequestStep)
- Step Input Types: Boolean (Pass / Fail), Numeric Measurement (with MinThreshold, MaxThreshold, and Unit—auto-flags out-of-range values), Single/Multi-Select Options (PM_StepOption), and Free-Text Observation.
- Conditional Follow-Up & Evidence: If a step fails or exceeds thresholds, require a mandatory photo (PM_StepPhoto), technician comment, and optionally trigger a follow-up corrective WR (PM Follow-up tab).
- Step Audit Log (PM_StepAuditLog): Immutable timestamped record of who completed or modified each step and when.

### 5.2 Work Sessions & Time Tracking (WorkSession)
- Built-in start/pause/stop timer on mobile WRs calculating actual TotalTimeMinutes, with support for manual override accompanied by a mandatory TimerOverrideReason.

### 5.3 Technical Audit & QA Inspection (TechnicalAudit)
- Dedicated workflow for supervisors/QA inspectors to sample completed WRs or inspect equipment directly:
  - Populates QA_InspectedBy, QA_IssueDescription, QA_CorrectionComment, pass/fail score, and photo evidence, with ability to reopen a WR if quality standards are not met.

## 6. Craftsperson Assignment & Interactive Resource Calendar
- Craftsperson Profiles (EmployeeManagement): Links user accounts to Craftperson and EmployeeProfile records with assigned Trades, skill levels, shift schedules, and hourly rates.
- Assignment Modes:
  - Direct & Multi-Craft Assignment: Assign one or multiple craftspeople to a WR (BaseWorkRequest_Craftperson).
  - Unassigned Trade Pool (Unassigned WRs): WRs assigned to a Trade (e.g., 02-Electrical) without a specific person appear in the mobile Unassigned WRs tab so qualified technicians can self-assign/claim them in the field.
- Interactive Dispatch Calendar / Scheduler:
  - Drag-and-drop timeline (Day / Week / Month views) grouped by Craftsperson and Trade.
  - Visual capacity bars showing allocated ExpectedHours vs. daily available shift hours.
  - Color-coded WR blocks by type (PM, LJ, FJ), urgency, and status (Issued, In Progress, Frozen, Completed).

## 7. Offline-First Mobile App (UI_NativeMobile Equivalent)
- True Offline Operation: Full read/write capability in areas with zero cellular or Wi-Fi coverage:
  - Local persistence of assigned WRs, unassigned trade WRs, full Equipment & Location hierarchy (Building, Floor, Room), Checklist Steps, and offline photo queue.
  - Automatic background synchronization with conflict resolution plus a manual Sync trigger with sync status indicator.
- Technician Home & Advanced Filtering:
  - Toggle between My WRs and Unassigned WRs.
  - Collapsible Filter Panel: Filter simultaneously by Building, Floor, Room (via pop-up search pickers), WR_ID, Trade, Show only with checklist toggle, Due Date From/To, Margin Date From/To, and Multi-Select Equipment.
  - Multi-Select Equipment Picker: Searchable/filterable equipment list where tapping an item toggles Select (blue) <-> Unselect (orange/green) instantaneously in-place without losing scroll position or hiding rows, plus an Unselect All button and Reset Filter action that clears all criteria globally.
  - Clean WR Preview Cards: Compact card layout displaying WR_ID, [SmartPM - Code] | Reason, Margin and Due dates aligned on the same row, Trade and Type on the same row, and current Status badge.

## 8. Desk Reservations & Space Booking (DeskReservations)
- Interactive Floor Plan Booking: Employees view office floor plans (parsed from DWG), see real-time desk/meeting room availability (Green = Free, Red = Occupied, Gray = Assigned/Permanent), and book desks for specific dates or time slots.
- Check-In via QR Code: Each desk has a QR code; scanning it via the mobile app checks the user in, while unclaimed bookings auto-release after a configurable grace period.

## 9. Data Import/Export, File Storage & Power BI-Style Analytics
### 9.1 Bulk Database Import / Export Engine
- Excel (.xlsx) & CSV Import/Export: Dedicated admin interface with downloadable templates for bulk importing and exporting Locations (Building, Floor, Room), Equipment, PM_ChecklistStandards (with steps), PM_Schedules, Trades, Employees, and historical WorkRequests.
- Dry-Run Validation: Preview import diffs (new records vs. updated records by unique code) and highlight row/column validation errors before committing to the database.

### 9.2 Document & Media Storage
- Attach multiple files (PDF manuals, electrical diagrams, safety procedures, spreadsheets) to Equipment, Blueprints, and Work Requests (Attached Documents tab).
- Automatic client-side image compression on mobile before uploading checklist failure photos or audit images to Cloud Storage.

### 9.3 Automated Reporting & Built-In BI Analytics (Power BI Equivalent)
- Executive & Operational Dashboards:
  - PM Compliance & SLA Tracker: % of PMs completed before DueDate vs. within MarginDate vs. overdue.
  - Backlog & Workload Analysis: Open WRs by Trade, Building, and Status (50% Issued, Frozen, 78% Technically Completed).
  - Asset Reliability: Top problematic Equipment by corrective WR count (FJ + LJ), total downtime, and labor hours consumed.
  - Technician Productivity: Planned ExpectedHours vs. actual logged WorkSession hours per craftsperson.
- Automated Scheduled Exports: Scheduled Cloud Function that generates weekly/monthly PDF executive summaries and .xlsx KPI datasets emailed automatically to stakeholders, plus live BigQuery/OData feed for direct Microsoft Power BI / Looker Studio connection.

## 10. Security & Role-Based Access Control (RBAC)
- Administrator Matrix: UI-based role and permission manager allowing the Site Administrator to restrict page, module, field-level, and button access by user role:
  - SiteAdministrator: Full system configuration, DB import/export, role assignment, status/trade setup.
  - ESA_LongJobManager / PM_Planner: Create/edit schedules, generate bulk WRs, assign craftspeople on the calendar, manage freezes, approve 78% -> 100% closures, view BI dashboards.
  - QA_Inspector: Access to Technical Audit module, QA sign-off fields, and read access to all WRs/Equipment.
  - MobileTechnician / Craftperson: Offline mobile access, self-assign from Unassigned trade pool, execute checklists, log time/photos, create Fast Jobs.
  - StandardEmployee: Desk reservation booking and submitting basic facility helpdesk tickets.
'@ | Set-Content -Path "docs/MASTER_SPEC.md" -Encoding UTF8
## 11. Long Job (LJ) Complete State Machine (0% to 100% Archived), 750 EUR Escalation & Multi-Site Isolation

### 11.1 Work Request Cost Thresholds & PM -> FJ -> LJ Escalation Chain
- **PM (Preventive Maintenance)**: Planned scheduled maintenance. If an issue is found during a PM step, a follow-up **FJ** can be opened (`ParentPM_WR_ID`).
- **FJ (Fast Job)**: Unplanned reactive repair **under 750 EUR** (`EstimatedCostEur < 750`). Can be created standalone (e.g., broken door) or from a PM. If an FJ cannot resolve the issue or costs >= 750 EUR, escalating it opens a linked **LJ** starting at **Substatus `10%`** (`Work Request from Fast Job - On Hold for Decision, Budget, etc.`, linked via `OriginatingFJ_WR_ID` and `OriginatingPM_WR_ID`).
- **LJ (Long Job)**: Unplanned complex repair, refurbishment, or project **normally >= 750 EUR** (`EstimatedCostEur >= 750`). Can be created standalone at `0% RFQ` or `0% RFW` (e.g., diesel generator crash) or escalated from an FJ at `10%`.
- **"Print Yellow Page"** action is available in ALL LJ substatuses (`0%` through `100%`).

### 11.2 The 10 Official Long Job Roles
- **Full Process Roles**:
  1. `ESA_TO` (ESA Technical Officer)
  2. `ESA_TM` (ESA Trade Manager)
  3. `ESA_LJM` (ESA Long Job Manager)
  4. `ESA_CCM` (ESA Contract / Cost Control Manager)
  5. `ESA_DO` (ESA Drawing Office / Draftsman — approves Drawing/Engineering updates)
  6. `ESA_IM` (ESA CIFM Inventory Manager / Admin — approves CIFM Inventory updates)
  7. `TRADE_CM` (Contractor / Trade Contract Manager)
  8. `TRADE_TM` (Contractor / Trade Manager)
- **Simplified Process Roles**:
  9. `ESA_LONG_JOB`
  10. `TRADE_LONG_JOB`

### 11.3 Complete LJ Substatus & Role Permission Matrix (RFQ & RFW)
- **RFQ Track (Request for Quotation)**:
  - `0%` (Requested - New Request for Quotation): `Save -> 0%`, `Submit to Trade -> 20%`, `Submit for Acceptance -> 25%`, `Cancel -> 27%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `10%` (Requested - Work Request from Fast Job - On Hold for Decision, Budget, etc.): `Save -> 10%`, `Submit to Trade -> 20%`, `Submit for Acceptance -> 25%`, `Cancel -> 27%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `20%` (Requested - Quotation Preparation Offer by Contractor): `Save -> 20%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `In Progress (21%) -> 21%` (`TRADE_TM`, `TRADE_LONG_JOB`), `Submit for Acceptance -> 25%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `Cancel -> 27%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`).
  - `21%` (Requested - Quotation Preparation Offer by Trade): `Save -> 21%`, `Submit for Acceptance -> 25%` (`TRADE_TM`, `TRADE_LONG_JOB`), `Cancel -> 27%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`).
  - `23%` (Requested - Quotation Not Accepted by ESA-TM. Review by Contractor): `Save -> 23%`, `In Progress (21%) -> 21%` (`TRADE_TM`, `TRADE_LONG_JOB`), `Submit for Acceptance -> 25%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `Cancel -> 27%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`).
  - `25%` (Requested - Quotation Pending Acceptance by ESA-Trade Manager): `Save -> 25%`, `Send to User for Acceptance -> 26%`, `Accept -> 28%`, `Accept and Convert to RFW -> 30%`, `Request Review -> 23%`, `Reject -> 29%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`.
  - `26%` (Requested - Quotation Pending Approval for User Budget): `Save -> 26%`, `Accept -> 28%`, `Request Review -> 23%`, `Reject -> 29%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`.
  - `28%` (Requested - Quotation Accepted): `Save -> 28%`, `Convert RFQ to RFW -> 30%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `27%` (Cancelled -> Archive -> Closed) & `29%` (Rejected -> Archive -> Closed).
- **RFW Track (Request for Work)**:
  - `0%` (Requested - New Request for Work) & `10%` (Work Request from Fast Job): `Save -> 0%/10%`, `Submit for Approval -> 30%`, `Cancel -> 27%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `30%` (Requested - Pending Approval From ESA Technical Officer) & `31%` (Approved Waiting for Budget): `Save -> 30%/31%`, `Reject -> 29%`, `Request Review -> 23%`, `On Hold for Budget -> 31%`, `Approve & Order -> 32%` | Allowed: `ESA_TO` ONLY.
  - `32%` (Issued and In Process - Work Request Ordered to Contractor): `Save -> 32%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `Commit -> 40%` (`TRADE_TM`, `TRADE_LONG_JOB`).
  - `40%` (Commitment to Due Date & Price Details), `50%` (Work Request Execution), `55%` (On Hold for Access / Labor / Parts):
    * `Save -> 40% / 50% / 55%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`).
    * `Technically Completed -> 78% (if any Acceptance Gate is required) OR 94% (if no Acceptance Gates are required)` | Allowed: `TRADE_TM`, `TRADE_LONG_JOB` (and `ESA_IM` at 50%).

### 11.4 The 78% - 94% Dynamic Acceptance Engine (Pre-SAT, SAT, Drawing/Engineering, CIFM Inventory)
Each LJ has 3 configurable boolean flags set during project planning/execution: `RequiresSAT`, `RequiresDrawingUpdate`, `RequiresInventoryUpdate`.
- If all 3 flags are `false`: `Technically Completed` jumps directly from `40%/50%/55%` to `94%` (`All Acceptances Completed`).
- If any flag is `true`: `Technically Completed` transitions to `78%` (`Work Ready for Approvals Cycle`).
- **Gate Roles & Sub-Actions**:
  1. **Pre-SAT** (active when `RequiresSAT = true`): `TRADE_TM` / `TRADE_LONG_JOB` clicks `Approve Pre-SAT` at `78%` -> transitions to `79%` (`Pre-SAT Performed`).
  2. **SAT Acceptance** (`RequiresSAT = true`): At `79%`, `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB` can click `Request Review` (stays `79%`), then `TRADE_TM` / `TRADE_LONG_JOB` clicks `Send Invitation` -> transitions to `80%` (`Work Request Ready for SAT Approval (Invite)`). When `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB` clicks `Approve SAT` (at `79%` or `80%`), it transitions to `81%` (`SAT Approved`) if Drawing or CIFM Inventory is still pending, OR directly to `94%` if all other required gates are already approved.
  3. **Drawing / Engineering Gate** (`RequiresDrawingUpdate = true`): Approved by Draftsman `ESA_DO` (or `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB`). Supports `Request Review` (ESA) and `Send Invitation` (`TRADE_TM`).
  4. **CIFM Inventory Gate** (`RequiresInventoryUpdate = true`): Approved by Inventory Admin `ESA_IM` (or `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB`). Supports `Request Review` (ESA) and `Send Invitation` (`TRADE_TM`).
  - Whenever the LAST remaining required gate (`SAT`, `Drawing/Engineering`, or `CIFM Inventory`) is approved, the LJ substatus automatically becomes `94%` (`All Acceptances Completed`).

### 11.5 Post-Acceptance Financial & Closure Chain (94% to 100% Archived)
- `94%` (`All Acceptances Completed`): `Completed -> 95%` | Allowed: `TRADE_TM`, `TRADE_LONG_JOB`.
- `95%` (`Complete WR --> Cost Information + Customer Feedback`): `Sign Yellow Page -> 96%` | Allowed: `TRADE_CM`.
- `96%` (`Work Request Approved by Contractor Contract Manager`): `Approve Costs -> 97%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`.
- `97%` (`Consistency Check Approved by ESA Trade Manager`): `Final Approval -> 98%` | Allowed: `ESA_TO`.
- `98%` (`Work Request Approved by ESA Technical Officer`): `Confirm Invoice Information -> 99%` | Allowed: `ESA_TO`, `ESA_CCM`.
- `99%` (`Work Request Invoicing Completed`): `Confirm Payment -> 100%` | Allowed: `TRADE_CM`, `TRADE_TM`, `TRADE_LONG_JOB`.
- `100%` (`Payment Received, Work Request Completed`): `manual archiving -> 100% archived` (`Closed`).

### 11.6 Multi-Site Data Isolation (Site 01, Site 02, Site 03) & Access Governance Monitor
- Every Location (`Building`, `Floor`, `Room`), `Equipment`, `BaseWorkRequest`, `PM_Schedule`, and `Desk` belongs to a `SiteId` (e.g., `SITE-01`, `SITE-02`, `SITE-03`).
- Users assigned to `SITE-02` must NEVER see WRs, Locations, Equipment, or Schedules from `SITE-01` or `SITE-03`. Only global `SiteAdministrator` or users explicitly granted multi-site access can switch across sites.
- The RBAC & User Access Monitor (`/admin/rbac`) must provide a complete governance dashboard to inspect and configure: (a) User -> Assigned Site(s), System Role, LJ Role (`ESA_TO`, `ESA_DO`, `ESA_IM`, `TRADE_TM`, etc.), and Trades, (b) Site Isolation Matrix, and (c) Interactive LJ Substatus Role Permission Matrix (`0%` to `100%`).

## 11. Long Job (LJ) Complete State Machine (0% to 100% Archived), 750 EUR Escalation & Multi-Site Isolation

### 11.1 Work Request Cost Thresholds & PM -> FJ -> LJ Escalation Chain
- **PM (Preventive Maintenance)**: Planned scheduled maintenance. If an issue is found during a PM step, a follow-up **FJ** can be opened (`ParentPM_WR_ID`).
- **FJ (Fast Job)**: Unplanned reactive repair **under 750 EUR** (`EstimatedCostEur < 750`). Can be created standalone (e.g., broken door) or from a PM. If an FJ cannot resolve the issue or costs >= 750 EUR, escalating it opens a linked **LJ** starting at **Substatus `10%`** (`Work Request from Fast Job - On Hold for Decision, Budget, etc.`, linked via `OriginatingFJ_WR_ID` and `OriginatingPM_WR_ID`).
- **LJ (Long Job)**: Unplanned complex repair, refurbishment, or project **normally >= 750 EUR** (`EstimatedCostEur >= 750`). Can be created standalone at `0% RFQ` or `0% RFW` (e.g., diesel generator crash) or escalated from an FJ at `10%`.
- **"Print Yellow Page"** action is available in ALL LJ substatuses (`0%` through `100%`).

### 11.2 The 10 Official Long Job Roles
- **Full Process Roles**:
  1. `ESA_TO` (ESA Technical Officer)
  2. `ESA_TM` (ESA Trade Manager)
  3. `ESA_LJM` (ESA Long Job Manager)
  4. `ESA_CCM` (ESA Contract / Cost Control Manager)
  5. `ESA_DO` (ESA Drawing Office / Draftsman — approves Drawing/Engineering updates)
  6. `ESA_IM` (ESA CIFM Inventory Manager / Admin — approves CIFM Inventory updates)
  7. `TRADE_CM` (Contractor / Trade Contract Manager)
  8. `TRADE_TM` (Contractor / Trade Manager)
- **Simplified Process Roles**:
  9. `ESA_LONG_JOB`
  10. `TRADE_LONG_JOB`

### 11.3 Complete LJ Substatus & Role Permission Matrix (RFQ & RFW)
- **RFQ Track (Request for Quotation)**:
  - `0%` (Requested - New Request for Quotation): `Save -> 0%`, `Submit to Trade -> 20%`, `Submit for Acceptance -> 25%`, `Cancel -> 27%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `10%` (Requested - Work Request from Fast Job - On Hold for Decision, Budget, etc.): `Save -> 10%`, `Submit to Trade -> 20%`, `Submit for Acceptance -> 25%`, `Cancel -> 27%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `20%` (Requested - Quotation Preparation Offer by Contractor): `Save -> 20%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `In Progress (21%) -> 21%` (`TRADE_TM`, `TRADE_LONG_JOB`), `Submit for Acceptance -> 25%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `Cancel -> 27%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`).
  - `21%` (Requested - Quotation Preparation Offer by Trade): `Save -> 21%`, `Submit for Acceptance -> 25%` (`TRADE_TM`, `TRADE_LONG_JOB`), `Cancel -> 27%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`).
  - `23%` (Requested - Quotation Not Accepted by ESA-TM. Review by Contractor): `Save -> 23%`, `In Progress (21%) -> 21%` (`TRADE_TM`, `TRADE_LONG_JOB`), `Submit for Acceptance -> 25%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `Cancel -> 27%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`).
  - `25%` (Requested - Quotation Pending Acceptance by ESA-Trade Manager): `Save -> 25%`, `Send to User for Acceptance -> 26%`, `Accept -> 28%`, `Accept and Convert to RFW -> 30%`, `Request Review -> 23%`, `Reject -> 29%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`.
  - `26%` (Requested - Quotation Pending Approval for User Budget): `Save -> 26%`, `Accept -> 28%`, `Request Review -> 23%`, `Reject -> 29%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`.
  - `28%` (Requested - Quotation Accepted): `Save -> 28%`, `Convert RFQ to RFW -> 30%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `27%` (Cancelled -> Archive -> Closed) & `29%` (Rejected -> Archive -> Closed).
- **RFW Track (Request for Work)**:
  - `0%` (Requested - New Request for Work) & `10%` (Work Request from Fast Job): `Save -> 0%/10%`, `Submit for Approval -> 30%`, `Cancel -> 27%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`.
  - `30%` (Requested - Pending Approval From ESA Technical Officer) & `31%` (Approved Waiting for Budget): `Save -> 30%/31%`, `Reject -> 29%`, `Request Review -> 23%`, `On Hold for Budget -> 31%`, `Approve & Order -> 32%` | Allowed: `ESA_TO` ONLY.
  - `32%` (Issued and In Process - Work Request Ordered to Contractor): `Save -> 32%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`), `Commit -> 40%` (`TRADE_TM`, `TRADE_LONG_JOB`).
  - `40%` (Commitment to Due Date & Price Details), `50%` (Work Request Execution), `55%` (On Hold for Access / Labor / Parts):
    * `Save -> 40% / 50% / 55%` (`ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`).
    * `Technically Completed -> 78% (if any Acceptance Gate is required) OR 94% (if no Acceptance Gates are required)` | Allowed: `TRADE_TM`, `TRADE_LONG_JOB` (and `ESA_IM` at 50%).

### 11.4 The 78% - 94% Dynamic Acceptance Engine (Pre-SAT, SAT, Drawing/Engineering, CIFM Inventory)
Each LJ has 3 configurable boolean flags set during project planning/execution: `RequiresSAT`, `RequiresDrawingUpdate`, `RequiresInventoryUpdate`.
- If all 3 flags are `false`: `Technically Completed` jumps directly from `40%/50%/55%` to `94%` (`All Acceptances Completed`).
- If any flag is `true`: `Technically Completed` transitions to `78%` (`Work Ready for Approvals Cycle`).
- **Gate Roles & Sub-Actions**:
  1. **Pre-SAT** (active when `RequiresSAT = true`): `TRADE_TM` / `TRADE_LONG_JOB` clicks `Approve Pre-SAT` at `78%` -> transitions to `79%` (`Pre-SAT Performed`).
  2. **SAT Acceptance** (`RequiresSAT = true`): At `79%`, `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB` can click `Request Review` (stays `79%`), then `TRADE_TM` / `TRADE_LONG_JOB` clicks `Send Invitation` -> transitions to `80%` (`Work Request Ready for SAT Approval (Invite)`). When `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB` clicks `Approve SAT` (at `79%` or `80%`), it transitions to `81%` (`SAT Approved`) if Drawing or CIFM Inventory is still pending, OR directly to `94%` if all other required gates are already approved.
  3. **Drawing / Engineering Gate** (`RequiresDrawingUpdate = true`): Approved by Draftsman `ESA_DO` (or `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB`). Supports `Request Review` (ESA) and `Send Invitation` (`TRADE_TM`).
  4. **CIFM Inventory Gate** (`RequiresInventoryUpdate = true`): Approved by Inventory Admin `ESA_IM` (or `ESA_TO` / `ESA_TM` / `ESA_LONG_JOB`). Supports `Request Review` (ESA) and `Send Invitation` (`TRADE_TM`).
  - Whenever the LAST remaining required gate (`SAT`, `Drawing/Engineering`, or `CIFM Inventory`) is approved, the LJ substatus automatically becomes `94%` (`All Acceptances Completed`).

### 11.5 Post-Acceptance Financial & Closure Chain (94% to 100% Archived)
- `94%` (`All Acceptances Completed`): `Completed -> 95%` | Allowed: `TRADE_TM`, `TRADE_LONG_JOB`.
- `95%` (`Complete WR --> Cost Information + Customer Feedback`): `Sign Yellow Page -> 96%` | Allowed: `TRADE_CM`.
- `96%` (`Work Request Approved by Contractor Contract Manager`): `Approve Costs -> 97%` | Allowed: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`.
- `97%` (`Consistency Check Approved by ESA Trade Manager`): `Final Approval -> 98%` | Allowed: `ESA_TO`.
- `98%` (`Work Request Approved by ESA Technical Officer`): `Confirm Invoice Information -> 99%` | Allowed: `ESA_TO`, `ESA_CCM`.
- `99%` (`Work Request Invoicing Completed`): `Confirm Payment -> 100%` | Allowed: `TRADE_CM`, `TRADE_TM`, `TRADE_LONG_JOB`.
- `100%` (`Payment Received, Work Request Completed`): `manual archiving -> 100% archived` (`Closed`).

### 11.6 Multi-Site Data Isolation (Site 01, Site 02, Site 03) & Access Governance Monitor
- Every Location (`Building`, `Floor`, `Room`), `Equipment`, `BaseWorkRequest`, `PM_Schedule`, and `Desk` belongs to a `SiteId` (e.g., `SITE-01`, `SITE-02`, `SITE-03`).
- Users assigned to `SITE-02` must NEVER see WRs, Locations, Equipment, or Schedules from `SITE-01` or `SITE-03`. Only global `SiteAdministrator` or users explicitly granted multi-site access can switch across sites.
- The RBAC & User Access Monitor (`/admin/rbac`) must provide a complete governance dashboard to inspect and configure: (a) User -> Assigned Site(s), System Role, LJ Role (`ESA_TO`, `ESA_DO`, `ESA_IM`, `TRADE_TM`, etc.), and Trades, (b) Site Isolation Matrix, and (c) Interactive LJ Substatus Role Permission Matrix (`0%` to `100%`).

## 12. Operational Refinements: Separated PM/FJ/LJ Views, 3-Tier Equipment Tree, Favourable Checklist Logic & Trade-Role Auto-Resolution

### 12.1 Global Persistent State & Unlocked Site Switcher
- All Web Portal entities (Sites, Buildings, Floors, Rooms, Equipment, Checklist Blueprints, PM Schedules, Work Requests [PM, FJ, LJ], Users, and Trade-Role Mappings) MUST be stored in a unified client-side store backed by `localStorage` (with a "Reset Demo Data" button) so creating or editing any record persists across page navigation and browser reloads.
- The top-bar **Site Dropdown** (`SITE-01 ESOC Darmstadt`, `SITE-02 ESTEC Noordwijk`, `SITE-03 ESRIN Frascati`) must ALWAYS be enabled and interactive so the tester can switch sites freely and see strict site filtering in real time.

### 12.2 Classical Trades & Trade-to-Role Governance Matrix
- The 7 standard Classical Trades across the entire platform are:
  1. `Mechanical`
  2. `Civil`
  3. `Electrical`
  4. `MultiTechnic`
  5. `Cleaning`
  6. `HeavyGang`
  7. `Catering`
- In `/admin/rbac`, administrators must be able to configure and monitor **Role Assignments in Relation to Trades & Sites**, specifically mapping which personnel hold the following roles for each of the 7 Classical Trades:
  - `ESA_TM` (ESA Trade Manager)
  - `ESA_CCM` (ESA Cost Centre Manager)
  - `TRADE_TM` (Trade Manager)
  - `TRADE_CM` (Trade Contract Manager)
  - Plus cross-cutting/site roles: `ESA_TO` (Technical Officer), `ESA_LJM` (Long Job Manager), `ESA_DO` (Draftsman / Drawing Office), `ESA_IM` (CIFM Inventory Admin), `QA_Inspector`, and `MobileTechnician`.

### 12.3 Long Job (LJ) Creation Form Rules
When creating a new Long Job (`LJ`), the user must define:
1. **Trade**: Chosen from the 7 Classical Trades (`Mechanical`, `Civil`, `Electrical`, `MultiTechnic`, `Cleaning`, `HeavyGang`, `Catering`).
2. **Equipment (Optional)**:
   - If an Equipment item is selected, its **Location (`RoomCode` / `LevelName` / `bl_id`) is automatically retrieved and populated** from the Equipment record.
   - If no Equipment is selected (e.g., painting a room or replacing floor tiles on a whole floor of Building P), the user can manually select **Building only**, **Building + Floor**, or **Building + Floor + Room**.
3. **Trade-Linked Roles (Auto-Retrieved from Trade)**:
   - Selecting the **Trade** automatically retrieves and populates the default assigned personnel for that Trade (with dropdowns allowing manual override if multiple users hold that role for the trade):
     * **ESA Trade Manager (`ESA_TM`)**
     * **ESA Cost Centre Manager (`ESA_CCM`)**
     * **Trade Manager (`TRADE_TM`)**
     * **Trade Contract Manager (`TRADE_CM`)**

### 12.4 Separated Work Request Views (PM, FJ, LJ) & PM Status Buckets
Work Requests must NOT be mixed in a single undifferentiated table. Provide 3 clearly separated workspaces/tabs (and sidebar links):
1. **Preventive Maintenance (`PM`) View**:
   Organized into 4 explicit status sub-tabs/buckets:
   - **Issued (`50%`) + On Hold for Labour/Parts/Access (`55%`)**
   - **Technically Completed (`78%`)**
   - **Cancelled (`27%`)**
   - **Completed (`100%`)**
2. **Fast Jobs (`FJ`) View**: Dedicated reactive maintenance (< 750 EUR) workspace with one-click escalation to `LJ` (at `10%`).
3. **Long Jobs (`LJ`) View**: Dedicated complex maintenance/project (>= 750 EUR) workspace with full `0% -> 100%` RFQ/RFW workflow and `78%–94%` acceptance gates.

### 12.5 Checklist Blueprints (Favourable Answer Definition & Select Options) & PM Schedules CRUD
- **Checklist Blueprints**:
  - Creating or editing a Blueprint must persist in the global store.
  - When a step's `InputType` is `SingleSelect` or `MultiSelect`, the UI must provide an interactive **Options List Builder** to add/edit/remove options (`Label`, `Value`, and `IsFavourable: boolean`).
  - **Favourable vs. Unfavourable Step Logic**: Every checklist step must define what answer is **Favourable (Pass)**.
    * For `Boolean` steps (`Yes` / `No`): Default Favourable answer is `"Yes"` (`FavourableBoolean: true`), but the creator can set `"No"` as Favourable (`FavourableBoolean: false`, e.g., "Any abnormal vibration or leak?"). During execution, if the technician selects the **unfavourable** answer, the step is flagged as Failed and requires a mandatory photo + comment (and enables opening a follow-up FJ).
    * For `SingleSelect` / `MultiSelect`: Selecting any option marked `IsFavourable: false` flags the step as Unfavourable/Failed.
    * For `Numeric`: Values within `[MinThreshold, MaxThreshold]` are Favourable; out-of-range values are Unfavourable/Failed.
- **PM Schedules**:
  - Users must be able to **Add New PM Schedule** and **Edit Existing PM Schedule** via a full modal (selecting Blueprint, Equipment/Location, Trade, Frequency, Next Due Date, Lead-Time Days, Margin Days, Active status) and save persistently.

### 12.6 Three-Level Equipment Hierarchy ("Subcomponent of")
- Equipment records must support at least 3 explicit hierarchy levels via `HierarchyLevel` (`'Installation' | 'Subequipment' | 'SubSubEquipment'`) and `ParentEquipmentCode` ("Subcomponent of"):
  1. **Level 1 — `Installation`** (root system, e.g., `EQ-001` Main HVAC Chiller Plant)
  2. **Level 2 — `Subequipment`** (subcomponent of an Installation, e.g., `EQ-001-A` Primary Chilled Water Pump)
  3. **Level 3 — `SubSubEquipment`** (subcomponent of a Subequipment, e.g., `EQ-001-A-1` Mechanical Shaft Seal / Differential Pressure Sensor)
- The `/equipment` registry must display a clear expandable 3-level tree / hierarchy badge and allow setting "Subcomponent of" (`ParentEquipmentCode`) when adding or editing equipment.

## 13. Pop-Up Location Pickers (Building <-> Floor <-> Room) & Multi-Select Equipment Modal Specification

### 13.1 Main Screen UI Pattern (No Native `<select>` Dropdowns)
Do NOT use native `<select>` dropdowns for Building, Floor, Room, or Equipment on Technician Home, Filter Panels, Select Equipment, or Work Request Creation/Edit screens. Render each selector as a horizontal picker row:
- **Building Row**: Read-only display box showing `{bl_id} - {buildingName}` or placeholder `All Buildings` | Right side: `Select...` button (opens Building Popup) + `✕` button (visible ONLY when a Building is selected).
- **Floor Row**: Read-only display box showing `{levelName}` or placeholder `All Floors` | Right side: `Select...` button (opens Floor Popup) + `✕` button (visible ONLY when a Floor is selected).
- **Room Row**: Read-only display box showing `{roomCode} - {roomName}` or placeholder `All Rooms` | Right side: `Select...` button (opens Room Popup) + `✕` button (visible ONLY when a Room is selected).
- **Equipment Row**: Read-only display box showing comma-separated selected `EquipmentCode`s (e.g., `0000000006, 0000000007`) or placeholder `All Equipment` | Right side: `Select...` button (opens Multi-Select Equipment Modal) + `✕` button (visible ONLY when >=1 Equipment is selected).

### 13.2 Bidirectional Cascading Logic (Top-Down & Bottom-Up)
1. **Bottom-Up Auto-Resolution (Child Automatically Fills Parents)**:
   - Picking a **Room** directly from the Room Pop-Up automatically resolves and populates its parent **Floor (`levelName`)** and grandparent **Building (`bl_id`)** into the Floor and Building fields.
   - Picking a **Floor** directly from the Floor Pop-Up automatically resolves and populates its parent **Building (`bl_id`)** into the Building field.
   - Picking an **Equipment** item (in single-equipment WR creation) automatically resolves and populates its `Room`, `Floor`, and `Building`.
2. **Top-Down Filtering (Parents Filter Child Pop-Ups)**:
   - **Floor Pop-Up**: If `selectedBuilding` is set, only display Floors where `floor.buildingId == selectedBuilding.id`. If empty, display all Floors across the active Site sorted by Building Code, then Floor Name.
   - **Room Pop-Up**: If `selectedFloor` is set, only display Rooms where `room.floorId == selectedFloor.id`. Else if `selectedBuilding` is set, display all Rooms where `room.buildingId == selectedBuilding.id`. Else display all Rooms across the active Site.
3. **Parent Change Conflict Check**:
   - If the user opens the Building Pop-Up and selects a different Building than the currently selected Floor/Room's parent, automatically clear `selectedFloor` and `selectedRoom`.
   - If the user changes Floor to a different Floor, automatically clear `selectedRoom` if it does not belong to the newly chosen Floor.
4. **Cascading Clear (`✕` Button) Rules**:
   - Clicking `✕` on **Building**: Clears `selectedBuilding`, `selectedFloor`, and `selectedRoom`.
   - Clicking `✕` on **Floor**: Clears `selectedFloor` and `selectedRoom`, keeping `selectedBuilding` intact.
   - Clicking `✕` on **Room**: Clears ONLY `selectedRoom`, keeping `selectedBuilding` and `selectedFloor` intact.

### 13.3 Pop-Up Picker Modal Design (`PickBuilding`, `PickFloor`, `PickRoom`)
- **Modal Header**: Title (`Select Building`, `Select Floor`, or `Select Room`) + Close (`✕`) button.
- **Instant Live Search Bar**:
  - In `Select Room`: searches by `roomCode`, `roomName`, `levelName`, or `bl_id`.
  - In `Select Floor`: searches by `levelName` or `bl_id`.
  - In `Select Building`: searches by `bl_id` or `buildingName`.
- **Scrollable Item List**:
  - **Room Row**: Primary text: `{roomCode} - {roomName}` | Subtitle: `Floor: {levelName} • Building: {bl_id} ({areaM2} m²)` | Right side: blue `Select` button.
  - **Floor Row**: Primary text: `{levelName}` | Subtitle: `Building: {bl_id}` | Right side: blue `Select` button.
  - **Building Row**: Primary text: `{bl_id} - {buildingName}` | Right side: blue `Select` button.
- **Selection Action**: Clicking `Select` updates state (running Bottom-Up Auto-Resolution and Parent Conflict Check), closes ONLY the active picker modal, and immediately updates the underlying screen.

### 13.4 Multi-Select Equipment Pop-Up (`Select Equipment`)
1. **Collapsible Location & Text Filter Header (`Filter ▼`)**:
   - Contains the exact same 3 horizontal pop-up picker rows (`Building`, `Floor`, `Room` with their `Select...` and `✕` buttons), pre-populated from the parent screen's active location state, plus live text search inputs for `Equipment Code` and `Equipment Name`.
   - Changing Building, Floor, or Room inside this header immediately filters the Equipment list below.
2. **Equipment List & In-Place Toggle (`Select` <-> `Unselect`)**:
   - Sorted strictly by `equipmentCode` ascending so rows never jump around.
   - Each card displays:
     * Line 1: `EQ: {equipmentCode}` (e.g., `EQ: 0000000006`)
     * Line 2: `{equipmentName}` (e.g., `VRF Indoor AC Unit - Open Office West`) + location subtitle
     * Line 3: Full-width **Blue `Select`** button (if not selected) OR full-width **Orange/Green `Unselect`** button (if selected).
   - **Strict In-Place Rule**: Clicking `Select` or `Unselect` toggles the button state in-place immediately without hiding the row or losing scroll position.
3. **Sticky Bottom Action Bar**:
   - **Confirm Selection (Primary Blue)**: Commits the staged equipment IDs into the main screen's Equipment display box (comma-separated `EquipmentCode`s) and closes the modal.
   - **Cancel (Secondary Gray/Blue)**: Closes the modal and discards any selection changes made during that modal session.
   - **Unselect All (Warning Orange)**: Clears all staged equipment IDs and flips all visible buttons back to `Select` in-place.
   - **Reset Filter (on Technician Home / Filter Panel)**: Clears `selectedBuilding`, `selectedFloor`, `selectedRoom`, all date/text filters, AND empties `selectedEquipmentIds[]`.
