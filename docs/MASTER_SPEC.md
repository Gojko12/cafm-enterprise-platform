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

## 14. Checklist Favourable/Unfavourable Builder, Full Long Job Details & Action Bar, Team Leader 100% Overview & Unified WR Activity/Comment Timeline

### 14.1 Checklist Step Favourable/Unfavourable Logic & Options Builder (All Input Types Except FreeText)
Every checklist step (in Blueprint Builder, Checklist Executor, and Team Leader Overview) MUST explicitly define and visually badge **Favourable (Green/Pass)** vs. **Unfavourable (Red/Fail)** answers for all input types except `FreeText`:
1. **`Boolean` (Yes / No)**:
   - Author selects which answer is Favourable: **Default = `Yes` is Favourable** (`favourableBoolean: true`), or toggle to **`No` is Favourable** (`favourableBoolean: false`).
   - Display a clear visual preview in the builder: e.g., `Favourable: YES (Green) | Unfavourable: NO (Red - triggers failure rule)`.
2. **`SingleSelect` & `MultiSelect`**:
   - When `SingleSelect` or `MultiSelect` is chosen in the Blueprint Builder, render an interactive **Options Manager** inside the step card:
     * Button `+ Add Option` to add options (`optionId`, `label`, `isFavourable: boolean`).
     * Each option row has a text input for the label, a green/red toggle button **`Favourable (Pass)` ↔ `Unfavourable (Fail)`**, and a delete button.
     * Pre-populate 2 default options when switching a step to `SingleSelect` or `MultiSelect` so it is never empty by accident.
3. **`Numeric`**:
   - Render inputs for `Unit` (e.g., `bar`, `°C`, `V`), `MinThreshold` (Favourable minimum), and `MaxThreshold` (Favourable maximum). Values within `[MinThreshold, MaxThreshold]` are Favourable (Green); values outside are Unfavourable (Red).
4. **Craftsperson & Team Leader Visibility + Team Leader 100% Closure**:
   - Both the Craftsperson executing the checklist and the **Team Leader (`TeamLeader` role)** reviewing WRs must see each step's answer badged clearly as **GREEN `FAVOURABLE`** or **RED `UNFAVOURABLE`** (along with failure photos and comments).
   - Provide a **Team Leader Overview / Approval Queue** across PM and FJ views where the Team Leader reviews `78% Technically Completed` WRs, inspects all checklist steps (highlighting any Unfavourable answers), and clicks **`Approve & Push to 100% (Completed)`** (or **`Reopen to 50%`** if rework is needed).

### 14.2 Complete Long Job (LJ) Creation & Details Drawer (Never Hide Stage Buttons)
1. **Create Long Job Modal**:
   - **Process Track**: Select `RFQ (Request for Quotation)` or `RFW (Request for Work)`.
   - **Trade**: Select from the 7 Classical Trades (`Mechanical`, `Civil`, `Electrical`, `MultiTechnic`, `Cleaning`, `HeavyGang`, `Catering`).
   - **Equipment (Optional) & Auto-Location**: Picking an Equipment item automatically populates its `Building`, `Floor`, and `Room` fields. Clearing Equipment allows picking `Building`, `Building + Floor`, or `Building + Floor + Room` manually.
   - **Auto-Retrieved Trade Roles Card**: Selecting a `Trade` automatically looks up and displays the assigned personnel for that Trade (with dropdowns to override):
     * `ESA Trade Manager (ESA_TM)`
     * `ESA Cost Centre Manager (ESA_CCM)`
     * `Trade Manager (TRADE_TM)`
     * `Trade Contract Manager (TRADE_CM)`
     * Plus `ESA Technical Officer (ESA_TO)`, `Draftsman (ESA_DO)`, and `CIFM Inventory Admin (ESA_IM)`.
2. **Long Job Details Drawer**:
   - Must display ALL LJ information: Process (`RFQ`/`RFW`), Current Substatus (`0%`–`100%`) with visual progress bar, Trade, Location (`Building / Floor / Room`), Equipment, Estimated & Actual Cost (`EUR`), Key Dates (`Created`, `Start`, `Due`, `Margin`), Freeze status & controls, Escalation chain links (`ParentPM_WR_ID`, `OriginatingFJ_WR_ID`), Assigned Trade Roles (`ESA_TM`, `ESA_CCM`, `TRADE_TM`, `TRADE_CM`, `ESA_TO`, `ESA_DO`, `ESA_IM`), and Attached Files/Images (with upload & remove buttons).
   - **Stage Transition Action Buttons (Always Visible & Testable)**:
     * Render all valid next-stage transition buttons for the current substatus (`0%` through `100% archived`, e.g., `Submit to Trade -> 20%`, `In Progress -> 21%`, `Submit for Acceptance -> 25%`, `Accept & Convert to RFW -> 30%`, `Approve & Order -> 32%`, `Commit -> 40%`, `Start Execution -> 50%`, `Put On Hold -> 55%`, `Technically Completed -> 78% / 94%`, `78%–81% Acceptance Gate buttons`, `Completed -> 95%`, `Sign Yellow Page -> 96%`, `Approve Costs -> 97%`, `Final Approval -> 98%`, `Confirm Invoice -> 99%`, `Confirm Payment -> 100%`).
     * Each button shows the permitted LJ Role badge (e.g., `[ESA_TO]`, `[TRADE_TM]`, `[ESA_DO]`). If `SiteAdministrator` is active or if the user enables the inline **"Role Simulator / Act As"** selector inside the drawer, allow clicking ANY valid next-stage button immediately and log the exact actor & role in the Activity Timeline.

### 14.3 Unified Activity Log & Versioned Comment Section on EVERY WR (PM, FJ, LJ)
Every Work Request (`PM`, `FJ`, and `LJ`) must include a unified **Activity & Comments Timeline (`WRActivityTimeline`)** in its detail drawer:
1. **Three Filter Modes**:
   - `All (Comments & Logs)` — unified chronological stream of human comments and automatic system logs.
   - `Human Comments Only` — filters to only messages written by users.
   - `Automatic Logs Only` — filters to only system-generated audit events.
2. **Automatic System Event Logging (Who, When, What)**:
   Automatically append an immutable log entry whenever any action happens on the WR:
   - Status/Substatus transitions: e.g., `"WR was set to 78% (Technically Completed) by Thomas (MobileTechnician)"`, `"LJ was transformed from 10% to 20% (Submit to Trade) by Lidija (ESA_TM)"`, `"WR pushed from 78% to 100% (Completed) by Gregor (TeamLeader)"`.
   - Checklist actions: e.g., `"Marko finished checklist (5/5 steps completed — 4 Favourable, 1 Unfavourable)"` or `"Step 2 marked Unfavourable by Marko"`.
   - Acceptance Gates: e.g., `"Draftsman (ESA_DO) gave OK for Drawing/Engineering update"`, `"CIFM Inventory Admin (ESA_IM) gave OK for Inventory update"`.
   - Attachments: e.g., `"Image 'valve_leak.png' was added by Marko"`, `"File 'old_quote.pdf' was removed by Lidija"`.
3. **Editable Human Comments with Permanent Version History**:
   - Any user can post a comment (`authorName`, `authorRole`, `createdAt`, `text`).
   - A user can click **`Edit`** on their own comment to update the text.
   - Editing a comment NEVER deletes or hides the old text: the previous text and its timestamp are pushed into `editHistory[]`, and the comment card displays an `(Edited)` badge with a visible/expandable **"Previous Versions"** history showing every prior version of that comment to all users.

## 15. Mendix-Style Multi-Tab PM `WR Details Popup` & Manual 78% Completion Rule

### 15.1 Strict Rule: Finishing a Checklist NEVER Auto-Advances Status to 78%
- Completing all steps in a checklist must NEVER automatically change `WorkRequestStatus` or `SubstatusPercentage` to `78%`.
- When all checklist steps are answered, mark the checklist as completed and log `"Checklist finished by {User}"` in `Checklist history` and `History`, while keeping the WR at `50% (Issued)` (or `55% On Hold`) so the user can still log labor hours, upload documents, or create follow-up Fast Jobs.
- Moving a PM WR to `27% (Cancelled)`, `55% (On Hold for Access/Labor/Parts)`, `78% (Technically Completed)`, or `100% (Completed)` is ALWAYS an explicit manual action performed in the **`Labor, parts & Completion`** tab.

### 15.2 Wide Multi-Tab `WR Details Popup` Structure (Exact Mendix Layout)
Opening a PM Work Request opens a wide modal (`WR Details Popup`) with the following 8 top tabs and 2 persistent bottom collapsible sections:

1. **Tab 1: `Work request details`** (4 collapsible Group Boxes):
   - **Group Box 1 — `Work Request`**:
     * Left column: `WR ID`, `Work request status`, `Start date (Date To Perform)`, `Start date (TBD)`, `created date`.
     * Right column: `ESA Work Type`, `Work request substatus` (e.g., `50%`, `55%`, `78%`, `27%`, `100%`), `Due date`, `Margin date`, `Trade name`, `Expected hours`.
   - **Group Box 2 — `Work Location`**:
     * Left column: `Room code`, `Level name`, `bl id`.
     * Right column: `Problem location`.
   - **Group Box 3 — `Equipment` (Group box)**:
     * Left column: `Equipment code`, `Local equipment code`, `Equipment name`, `Equipment Standard Description`, `Equipment standard ID`.
     * Right column: `Is installation` (Yes / No dropdown).
   - **Group Box 4 — `Preventive Maintenance Procedure Details`**:
     * Left column: `PMP ID Original`, `PMP ID Smart`, `PM Procedure Description`, `PM Procedure Description SMART`, `Responsible company`, `Responsible person`.
     * Right column: `PMS ID Original`, `PMS ID Smart`.

2. **Tab 2: `Labor, parts & Completion`**:
   - **`Assign Craftperson`** button + `WR ID` header.
   - **Craftperson Labor Table** with filter row and columns: `Hourly rate`, `Working time` (hours/minutes), `Name`, `LastName` (with ability to assign craftspeople and log working time).
   - **`WR Statuses` Selector Dropdown**: Allows selecting `50% - Issued`, `55% - On Hold for Access`, `55% - On Hold for Labor`, `55% - On Hold for Parts`, `78% - Technically Completed`, `27% - Cancelled`, `100% - Completed`.
   - **3 Explicit Status Action Buttons**:
     * Red button: **`Cancel WR (27%)`**
     * Blue outlined button: **`Technically Completed (78%)`**
     * Blue outlined button: **`Complete (100%)`** (for Team Leader / Supervisor closure)
   - **`Message text` textarea + `Post` button**: Posts a human comment directly into the bottom `History` section.

3. **Tab 3: `KPI & Others`**:
   - SLA compliance status (Before Due Date / Within Margin Date / Overdue), On-Hold/Freeze details (`55%` reason), downtime tracking, and KPI notes.

4. **Tab 4: `Attached Documents`**:
   - **`+ New WR Document`** button + `Name` search filter input.
   - Document table showing attached files (e.g., `.xlsx`, `.pdf`, images) with **`Open`** and **`Delete`** buttons on every row. Adding or deleting a document automatically writes an entry to `History`.

5. **Tab 5: `Checklist`** & **Tab 8: `Checklist - Smart PM`**:
   - **`Checklist - Smart PM`** tab displays:
     * `Checklist Standard` dropdown/field showing the active blueprint.
     * **`Modify Checklist..`** button (opens the interactive step-by-step Checklist Executor modal to fill or update answers without auto-closing the WR to 78%).
     * Filterable Step Table with columns: `Sequence`, `Checklist step`, `Expected value Unit`, `Measured value`, `Is completed` (`Yes`/`No` filter), `Craftperson comment`, plus **Favourable (Green) / Unfavourable (Red)** status badge and failure photo preview.
   - **`Checklist`** tab displays legacy/standard checklist summary items or read-only print view.

6. **Tab 6: `PM Follow-up`**:
   - **`Create FastJob`** button (opens a modal pre-linked to this PM's Equipment and Location to create a reactive Fast Job `< 750 EUR`, which can later be escalated to a Long Job `>= 750 EUR`).
   - Filterable table of linked Follow-Up Fast Jobs with columns: `Urgency`, `Description`, `Reported date`, `Problem location`, `Job ID`, `Due date`, `Start date`, and current status (clicking a row opens that Fast Job).

7. **Tab 7: `AuditLog`**:
   - QA / Technical Audit inspection records (`To Be Inspected`, `Passed Inspected`, `PM WRs to be corrected`) and full system audit trail.

8. **Persistent Bottom Collapsible Sections (Visible across tabs at the bottom of `WR Details Popup`)**:
   - **`Checklist history`** (collapsible `+`/`-` bar): Filterable table with columns `Timestamp`, `Performed by`, `Action type`, `Step reference`, `Details`.
   - **`History`** (collapsible `+`/`-` bar): Unified stream of **Human Comments** (from `Message text -> Post`, editable with visible version history) and **Automatic System Logs** (who changed status, who finished checklist, who added/deleted documents, when), with filter toggles for `All`, `Human Comments Only`, and `Automatic Logs Only`.

## 16. Mendix Preventive Maintenance Operational Sub-Queues & Wide Multi-Tab `FJ` and `LJ` Details Popups

### 16.1 Complete Mendix Preventive Maintenance Sub-Navigation & Queues
Under Preventive Maintenance (`/preventive-maintenance` and `/smart-pm`), provide direct sub-navigation tabs/views matching the Mendix operational sidebar:
1. **`PMP` (Preventive Maintenance Procedures / Blueprints)**: Create and edit procedures/checklists with Favourable/Unfavourable rules for Boolean, Numeric, SingleSelect, and MultiSelect steps.
2. **`Assign PMP to EQ`**: Interactive bulk & single assignment matrix to link `PMP` blueprints directly to `Equipment` items (filtered via the Pop-Up Location Pickers `Building <-> Floor <-> Room` and 3-level Equipment hierarchy `Installation -> Subequipment -> SubSubEquipment`), automatically creating or updating `PM_Schedule` records.
3. **`Define PM Schedules`** & **`Generate Work Request`**: Full CRUD on PM schedules and horizon/selected WR generator.
4. **`Manage Craftperson`**: Dedicated view to manage Craftsperson profiles (`Name`, `LastName`, `Trade`, `Hourly rate`, `Working time / Shift hours`, `Assigned Site`, `Skill Level`) used across the `Assign Craftperson` tables.
5. **The 6 Operational PM Work Request Queues**:
   - **`Issued PM WRs`**: Active PMs at `50% (Issued)` and `55% (On Hold for Access / Labor / Parts)`.
   - **`To Be Inspected PM WRs`**: PMs at `78% (Technically Completed)` awaiting Team Leader / QA inspection (`QA_InspectionStatus == 'Pending'` or not yet inspected).
   - **`Passed Inspected PM WRs`**: PMs inspected by QA / Team Leader and marked as **Passed** (`QA_InspectionStatus == 'Passed'`), ready for or pushed to `100% Completed`.
   - **`PM WRs to be corrected`**: PMs that failed QA inspection or Team Leader review (`QA_InspectionStatus == 'ToBeCorrected'`), displaying the mandatory `QA_IssueDescription` and `QA_CorrectionComment` so technicians can fix the issue and re-submit.
   - **`Completed PM WRs`**: Closed PMs at `100% (Completed)`.
   - **`Canceled PM WRs`**: Canceled PMs at `27% (Cancelled)`.

### 16.2 Wide Multi-Tab `FJ Details Popup` (Fast Jobs < 750 EUR)
Replace the narrow side drawer for Fast Jobs with a wide Mendix-style `FJ Details Popup` modal containing:
- **Tab 1: `Work request details`**:
  * Group Box 1 (`Fast Job Details`): `WR ID`, `Job ID`, `Work request status`, `Work request substatus` (`50%`, `55%`, `78%`, `27%`, `100%`), `Urgency`, `Trade name`, `Estimated Cost (< 750 EUR)`, `Actual Cost (EUR)`, `Created date`, `Start date`, `Due date`, `Margin date`, `Parent PM WR ID` (if spawned from a PM Follow-up).
  * Group Box 2 (`Work Location`): `Room code`, `Level name`, `bl id`, `Problem location`.
  * Group Box 3 (`Equipment`): `Equipment code`, `Local equipment code`, `Equipment name`, `Hierarchy Level` (`Installation / Subequipment / SubSubEquipment`).
- **Tab 2: `Labor, parts & Completion`**:
  * `Assign Craftperson` button and table (`Hourly rate`, `Working time`, `Name`, `LastName`), spare parts/materials cost rows, status buttons (`Cancel WR (27%)`, `On Hold (55%)`, `Technically Completed (78%)`, `Complete (100%)`), and a prominent **`Escalate to Long Job (>= 750 EUR at 10%)`** button (if the FJ cannot fix the problem or exceeds 750 EUR).
  * `Message text` + `Post` button for human comments.
- **Tab 3: `Attached Documents`**: `+ New WR Document` / photo upload with `Open` and `Delete` buttons.
- **Tab 4: `AuditLog & QA`**: QA Pass / To Be Corrected inspection controls.
- **Persistent Bottom `History` Accordion**: Unified stream of Human Comments (editable with visible prior version history) and Automatic System Logs (`All`, `Human Comments Only`, `Automatic Logs Only`).

### 16.3 Wide Multi-Tab `LJ Details Popup` (Long Jobs >= 750 EUR, 0% to 100% Archived)
Replace the narrow side drawer for Long Jobs with a wide Mendix-style `LJ Details Popup` modal containing a top header bar (showing `WR ID`, `Process: RFQ | RFW`, `Substatus % badge`, inline **`Act as LJ Role`** selector, and the always-available amber **`Print Yellow Page`** button) and 6 structured tabs:
- **Tab 1: `Work request details & Roles`**:
  * Group Box 1 (`Long Job Core`): `WR ID`, `Process (RFQ/RFW)`, `Work request status`, `Current Substatus (0%–100%)`, `Substatus Description`, `Trade`, `Estimated Cost (>= 750 EUR)`, `Actual Cost`, `Created Date`, `Due Date`, `Margin Date`, `Originating FJ WR ID`, `Parent PM WR ID`.
  * Group Box 2 (`Work Location & Equipment`): `bl id`, `Level name`, `Room code`, `Problem location`, and optional `Equipment` details.
  * Group Box 3 (`Assigned Trade & ESA Roles`): Auto-retrieved & editable role assignments for `ESA Trade Manager (ESA_TM)`, `ESA Cost Centre Manager (ESA_CCM)`, `Trade Manager (TRADE_TM)`, `Trade Contract Manager (TRADE_CM)`, `ESA Technical Officer (ESA_TO)`, `ESA Long Job Manager (ESA_LJM)`, `Draftsman / Drawing Office (ESA_DO)`, and `CIFM Inventory Admin (ESA_IM)`.
- **Tab 2: `Quotation, Budget & Ordering (0% - 32%)`**:
  * Interactive stage progression panel for `RFQ` (`0%`, `10%`, `20%`, `21%`, `23%`, `25%`, `26%`, `28% -> Convert RFQ to RFW 30%`) and `RFW` (`0%`, `10%`, `30%`, `31% On Hold for Budget`, `32% Work Request Ordered to Contractor`), contractor quotation breakdown table, and role-validated action buttons.
- **Tab 3: `Execution, Labor & Freeze (32% - 78%)`**:
  * `Commit (40%)`, `Work Execution (50%)`, and `On Hold / Freeze (55% for Access / Labor / Parts)` controls with automatic SLA Margin Date extension, plus `Assign Craftperson` labor table (`Hourly rate`, `Working time`, `Name`, `LastName`) and the **`Technically Completed`** button (which routes to `78%` if any Acceptance Gate is required, or directly to `94%` if no gates are required).
- **Tab 4: `Acceptances: SAT, Drawing & Inventory (78% - 94%)`**:
  * Checkboxes to configure project requirements: `Requires SAT`, `Requires Drawing/Engineering Update`, `Requires CIFM Inventory Update`.
  * Interactive Gate Cards for **Pre-SAT (`TRADE_TM`)**, **SAT (`ESA_TO`/`ESA_TM`)**, **Drawing/Engineering (`ESA_DO` Draftsman)**, and **CIFM Inventory (`ESA_IM` Inventory Admin)** with `Approve / Give OK`, `Request Review`, and `Send Invitation` buttons that dynamically transition `78% -> 79% -> 80% -> 81% -> 94% (All Acceptances Completed)` and log every action in `History`.
- **Tab 5: `Financial Closure & Yellow Page (94% - 100%)`**:
  * Step-by-step post-acceptance buttons: `94% -> 95% (Completed - Cost Info + Customer Feedback by TRADE_TM)`, `95% -> 96% (Sign Yellow Page by TRADE_CM)`, `96% -> 97% (Approve Costs by ESA_TO/ESA_TM)`, `97% -> 98% (Final Approval by ESA_TO)`, `98% -> 99% (Confirm Invoice Information by ESA_TO/ESA_CCM)`, `99% -> 100% (Confirm Payment by TRADE_CM/TRADE_TM)`, and `100% -> 100% archived`.
  * Embedded printable **Official Yellow Page Preview** showing all project metadata, cost tables, and timestamped digital signatures for every stage and acceptance gate.
- **Tab 6: `Attached Documents`**:
  * `+ New LJ Document` (quotations, redline CAD drawings, SAT protocols, invoices) with `Open` and `Delete` actions logged to `History`.
- **Persistent Bottom `History` Accordion**:
  * `Message text` + `Post` button and unified timeline with `All`, `Human Comments Only` (with `Edit` and visible prior versions), and `Automatic Logs Only`.

## 17. Dedicated Site Role Assignments Window (Main/Deputy & Notifications), Fixed/Ceiling Cost Type & Mendix LJ Action Button Matrix

### 17.1 Separate `Site Role Assignments` Window (`/site-role-assignments`)
Create a dedicated page in the main left sidebar (`Site Role Assignments` at `/site-role-assignments`) to manage and monitor exact combinations of:
- `SiteId` (`SITE-01 ESOC Darmstadt`, `SITE-02 ESTEC Noordwijk`, `SITE-03 ESRIN Frascati`)
- `PersonName` (e.g., `Mark`, `Yvonne`, `Claudia`, `Bastian`, `Lidija`, `Thomas`, `Stefan`, `Gregor`)
- `RoleCode`:
  * `ESA_TM` (ESA Trade Manager)
  * `TRADE_TM` (Trade Manager)
  * `ESA_CCM` (ESA Cost Centre Manager)
  * `TRADE_CM` (Trade Contract Manager)
  * `ESA_TO` (ESA Technical Officer)
  * `ESA_LJM` (ESA Long Job Manager)
  * `ESA_DO` (Draftsman / Drawing Engineering)
  * `ESA_IM` (CIFM Inventory Admin)
  * `ESA_LONG_JOB` (Simplified ESA Role)
  * `TRADE_LONG_JOB` (Simplified Trade Role)
- `Trade` (`Mechanical`, `Civil`, `Electrical`, `MultiTechnic`, `Cleaning`, `HeavyGang`, `Catering`, or `All` for site-wide roles)
- `AssignmentLevel`: `'Main' | 'Deputy'`
- `ReceiveNotifications`: `boolean` (`Yes` / `No`)

#### Required Default Seeded Assignments (for SITE-01 ESOC Darmstadt):
1. `Mark` | Role: `ESA Trade Manager (ESA_TM)` | Trade: `Mechanical` | Level: `Main` | Receive Notifications: `Yes`
2. `Mark` | Role: `ESA Trade Manager (ESA_TM)` | Trade: `Electrical` | Level: `Deputy` | Receive Notifications: `No`
3. `Yvonne` | Role: `ESA Trade Manager (ESA_TM)` | Trade: `Electrical` | Level: `Main` | Receive Notifications: `Yes`
4. `Claudia` | Role: `Trade Manager (TRADE_TM)` | Trade: `Mechanical` | Level: `Main` | Receive Notifications: `Yes`
5. `Bastian` | Role: `Trade Manager (TRADE_TM)` | Trade: `Mechanical` | Level: `Deputy` | Receive Notifications: `No`
- Also seed Main/Deputy assignments for `Electrical`, `Civil`, `MultiTechnic`, `Cleaning`, `HeavyGang`, `Catering` and for `ESA_TO`, `ESA_LJM`, `ESA_CCM`, `TRADE_CM`, `ESA_DO`, and `ESA_IM` so all stages 0%–100% can be tested immediately.

### 17.2 How `Site Role Assignments` Drive LJ Permissions, Auto-Population & Notifications
1. **Auto-Population on LJ Creation**:
   - When creating an LJ for a chosen `Site` and `Trade` (e.g., `Mechanical`), automatically assign the **`Main`** person for `ESA_TM` (`Mark`), `TRADE_TM` (`Claudia`), `ESA_CCM`, and `TRADE_CM`, while also listing any **`Deputy`** (`Bastian` for Mechanical `TRADE_TM`; `Mark` for Electrical `ESA_TM`) as authorized actors.
   - Display a badge showing who will receive email/system notifications (`ReceiveNotifications == true`) when the LJ changes stage.
2. **Active Person Switcher in Top Bar & LJ Action Authorization**:
   - Add an **Active Person Switcher** in the top navigation bar (e.g., `Mark`, `Yvonne`, `Claudia`, `Bastian`, `Thomas [ESA_TO]`, `Draftsman [ESA_DO]`, `Inventory [ESA_IM]`, `SiteAdmin [All Override]`).
   - A person is authorized to click an LJ stage button if they have a `Site Role Assignment` (`Main` OR `Deputy`) on that LJ's `SiteId` and `Trade` (or `All` trades) for ANY of the roles marked `'P'` in the Excel specification for that transition!
   - For example:
     * If `Mark` is selected, he can execute `ESA_TM` actions on **Mechanical** LJs (as `Main`, Notifications: Yes) AND on **Electrical** LJs (as `Deputy`, Notifications: No), but NOT on `Civil` LJs unless assigned.
     * If `Claudia` (Main) or `Bastian` (Deputy) is selected, they can execute `TRADE_TM` actions on **Mechanical** LJs (`In Progress (21%)`, `Submit for Acceptance (25%)`, `Commit (40%)`, `Technically Completed (78_80_81_94%)`, `Completed (95%)`, `Confirm payment (100%)`).

### 17.3 Long Job Cost Type (`Fixed` vs `Ceiling`)
- Add `CostType: 'Fixed' | 'Ceiling'` (`Fixed Price` vs `Ceiling Price`) to `BaseWorkRequest` / Long Jobs.
- Include the `Cost Type` (`Fixed` / `Ceiling`) selector in the **Create Long Job** modal and display/edit it in the **Long Job Details Popup**.

### 17.4 Exact Mendix-Style `Actions` Panel & Stage Buttons inside `Long job New edit` Popup
Inside the Long Job Popup (`WR` tab), render a prominent collapsible **`Actions`** panel at the top styled with clean white blue-bordered action buttons (`border border-blue-400 text-blue-600 bg-white hover:bg-blue-50 rounded px-3.5 py-2 text-sm`) matching the Mendix screenshot and `LONG_JOBS_All_Steps_summary_02072019_V7 (4).xls`:
- `Save` (keeps current substatus, permitted per Excel `P` matrix)
- `Submit to Trade (20%) (0&10)` (from RFQ `0%`, `10%` -> `20%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`)
- `In Progress (21%)` (from RFQ `20%`, `23%` -> `21%` | Roles: `TRADE_TM`, `TRADE_LONG_JOB`)
- `Request Review (23%) (25&26)` (from RFQ `25%`, `26%` -> `23%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
- `Request Review (23%) (30&31)` (from RFW `30%`, `31%` -> `23%` | Roles: `ESA_TO`)
- `Submit for Acceptance (25%) (0_10)` (from RFQ `0%`, `10%` -> `25%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`)
- `Submit for Acceptance (25%) (20_23)` (from RFQ `20%`, `23%` -> `25%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`)
- `Submit for Acceptance (25%) (21)` (from RFQ `21%` -> `25%` | Roles: `TRADE_TM`, `TRADE_LONG_JOB`)
- `Submit to User for Acceptance (26%) (25)` (from RFQ `25%` -> `26%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
- `Cancel (27%) (23,0,10)` (from RFQ `0%`, `10%`, `20%`, `21%`, `23%` & RFW `0%`, `10%` -> `27%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`)
- `Accept (28%) (25, 26)` (from RFQ `25%`, `26%` -> `28%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
- `Reject (29%) (25, 26)` (from RFQ `25%`, `26%` -> `29%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
- `Reject (29%) (30, 31)` (from RFW `30%`, `31%` -> `29%` | Roles: `ESA_TO`)
- `Accept & Convert to RFW 30%` (from RFQ `25%`, `28%` -> `30% RFW` and RFW `0%`, `10%` `Submit for Approval (30%)` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `ESA_LONG_JOB`)
- `On Hold for Budget (31%) (30)` (from RFW `30%`, `31%` -> `31%` | Roles: `ESA_TO`)
- `Approve & Order (32%) (30,31)` (from RFW `30%`, `31%` -> `32%` | Roles: `ESA_TO`)
- `Commit (40%) (32)` (from RFW `32%` -> `40%` | Roles: `TRADE_TM`, `TRADE_LONG_JOB`)
- `In Progress (50%) (40)` (from RFW `40%`, `55%` -> `50%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`)
- `On Hold for Access / Labor / Parts (55%) (40_50)` (from RFW `40%`, `50%` -> `55%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LJM`, `TRADE_TM`, `ESA_LONG_JOB`, `TRADE_LONG_JOB`)
- `Technically Completed (78_80_81_94%) (50_55)` (from RFW `40%`, `50%`, `55%` -> `78%` if any acceptance gate is required, else `94%` | Roles: `TRADE_TM`, `TRADE_LONG_JOB`, plus `ESA_IM` at `50%`)
- `78%–81%` Acceptance Actions:
  * `Approve Pre-SAT (79%) (78)` (`TRADE_TM`, `TRADE_LONG_JOB`)
  * `Send Invitation (80%) (78_79_81)` (`TRADE_TM`, `TRADE_LONG_JOB` for SAT, Drawing, or CIFM Inventory)
  * `Request Review (78_79_80_81)` (`ESA_TO`, `ESA_TM`, `ESA_DO`, `ESA_IM`, `ESA_LONG_JOB`)
  * `Approve SAT (81_94%) (79_80)` (`ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
  * `Approve Drawing/Engineering (78_79_80_81 -> 94%)` (`ESA_DO`, `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
  * `Approve CIFM Inventory (78_79_80_81 -> 94%)` (`ESA_IM`, `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
- `Completed (95%) (94)` (from RFW `94%` -> `95%` | Roles: `TRADE_TM`, `TRADE_LONG_JOB`)
- `Sign Yellow Page (96%) (95)` (from RFW `95%` -> `96%` | Roles: `TRADE_CM`, `TRADE_LONG_JOB`)
- `Approve Costs (97%) (96)` (from RFW `96%` -> `97%` | Roles: `ESA_TO`, `ESA_TM`, `ESA_LONG_JOB`)
- `Final Approval (98%) (97)` (from RFW `97%` -> `98%` | Roles: `ESA_TO`)
- `Confirm Invoice Information (99%) (98)` (from RFW `98%` -> `99%` | Roles: `ESA_TO`, `ESA_CCM`, `ESA_LONG_JOB`)
- `Confirm payment (100%) (99)` (from RFW `99%` -> `100%` | Roles: `TRADE_CM`, `TRADE_TM`, `TRADE_LONG_JOB`)
- `Manual Archiving (100% archived) (100)` (from RFW `100%` -> `100% archived`)

Include a toggle in the `Actions` header:
1. **`Filter by Current Stage & Active Person's Role (Default)`**: Shows ONLY the buttons allowed at the current substatus for the active user's `Site Role Assignment` (`Main` or `Deputy` on that Site + Trade).
2. **`Show All Mendix Buttons (Overview Mode)`**: Shows the entire Mendix button grid from the screenshot so the user can see all buttons and which stages/roles unlock them.

## 18. Full-Stack Integration & Persistence Upgrade

### 18.1 Disk-Backed State and Offline Synchronization
- The web portal exposes `/api/cafm-state` for the complete platform state, persisted on disk in `.data/cafm-db.json` or an equivalent SQLite database as well as cached in browser storage. The mobile app at `http://localhost:3001` can access the portal at `http://localhost:3000` through explicitly configured CORS.
- State includes sites and locations, equipment hierarchy, classical trades, site role assignments including Main/Deputy and notification preferences, blueprints, schedules, craftspeople, and PM/FJ/LJ work requests including history and checklist history.
- Web changes become available to mobile, and offline checklist answers, evidence, work sessions and follow-up work requests synchronize back to web. Both manual and background synchronization must retain unsent changes on failure and report conflicts rather than silently overwrite concurrent changes or report simulated success.
- Disk persistence and the sync API must preserve site isolation and access controls; CORS is not authentication. Writes must be validated and crash-safe, and concurrent clients must not lose changes.
- Local development on localhost uses a publicly known fallback token unless a shared token is configured; non-development mode requires explicit configuration. CORS permits only `http://localhost:3000` and `http://localhost:3001`; clients send `x-cafm-site-id` and `x-cafm-person`. These selectors and the browser-visible token are not authenticated identities or production site authorization. Do not expose the demo server to untrusted networks; Firebase-backed authentication and authorization remain necessary for production.

### 18.2 Live CAD Room Extraction
- `/api/cad-parse` accepts DXF uploads or a generated sample and invokes the Python CAD parser using `ezdxf` and Shapely. It returns room codes, net areas in square metres, GeoJSON/SVG geometry, and extracted desks.
- The locations and floor-plan views consume the results for the selected site, building and floor. Import must validate drawing units and geometry, and must not silently replace unrelated floor data.

### 18.3 Live Bulk Import and Export
- Provide downloadable `.xlsx` and CSV templates, a dry-run preview of new and changed records with row and field validation errors, and a commit operation that persists validated records. A preview must describe the actual submitted file and a commit must not report success before persistence succeeds.

## 19. Work Request UI and Data Grid

- The portal header is a single compact row. Active Person determines site-assigned roles; SiteAdmin provides the explicit all-role demo override. The role count exposes assignments on hover or focus.
- PM, FJ and LJ details use a wide dialog and a single compact tab row. The LJ Actions panel shows concise action names; its hover text identifies source stages, eligible roles and assigned people, and unavailable actions remain non-executable.
- Work request views default to an editable grid with per-column combined filters, full-details links, selection of visible rows, and a Card View alternative. Edits and bulk changes append before/after details to each request's history. Location edits preserve the building/floor/room hierarchy and clear incompatible equipment. Hidden selections are counted in the bulk bar.
- Bulk deletion moves the full request, including its deletion history entry, into the site-scoped persisted `deletedWorkRequests` archive rather than discarding its history. The mobile synchronization payload preserves this archive.
- Grid status changes use the configured `WR_Statuses`, require the Team Leader or SiteAdministrator for 100% completion, and require passed PM QA. Frozen requests and LJ workflows must be handled through their full popups. The 55% and 27% options require popup handling because they are not currently defined in the central status configuration; rejected bulk changes do not partially apply.

## 20. Compact Work Request Overview and Expanded Demo Data

- The work-request filter is collapsed by default, with quick search, active-filter count, reset, and grid/card controls in the compact header. Expanded location/equipment pickers retain parent resolution, cascading clear and site filtering; due-date filters exclude records without a due date.
- Overview table cells are read-only. Independent column filters include assigned craftsperson, and Open / Edit or double-click opens the appropriate details popup. Editable details, validated location changes and their history entries belong in that popup; existing audited bulk actions remain available through selection.
- LJ grid and card views group filtered requests by percentage by default. Each collapsible group reports descriptions, process tracks, visible count and total estimated cost; Flat List disables grouping.
- Each site's deterministic demo seed includes four buildings, twelve floors, 24 rooms, 36 equipment records in three-level trees, ten craftspeople, twelve checklists, eighteen schedules, and 77 PM/FJ/LJ requests with comments and audit entries. The seeded checklist examples cover all input types and both Boolean favourable values.
- The browser cache seed key is versioned, but older local or disk data is not automatically replaced. Reset Demo Data explicitly replaces only the active site's data using revision-checked disk persistence, updates local storage on success, and reports synchronization conflicts or failures. Reset each site separately when a new demonstration dataset is desired.

## 21. Column Controls and Equipment Overview (Partial Implementation)

- Work-request, equipment, building, floor and room overview tables support sortable column headers and persistent column ordering and visibility, with drag-and-drop and keyboard-accessible move buttons. Work-request selection and bulk actions remain available.
- The work-request toolbar replaces the duplicate top header and type navigation. Dedicated sidebar links select PM, FJ or LJ.
- The Section 21 demo seed uses globally distinct ten-digit equipment IDs and 2026-prefixed sequential work-request IDs across the three seeded sites. It includes the official 14 equipment categories and three-level parent chains. Reset remains scoped to the current site; existing saved data is not automatically rewritten.
- The equipment overview opens a site-scoped split detail panel with general and technical details, linked work-request popups, document attachments and recorded-data KPIs. Hierarchy edits validate the selected parent and existing children. Metrics that cannot be derived reliably are explicitly shown as unavailable.
- Global sequential ID allocation for newly created or offline-synchronized records, a server-enforced cross-record equipment hierarchy, equipment creation and full equipment-linked FJ/LJ creation, and calculated MTBF/MTTR/availability/health scores remain outstanding.

## 22. Equipment and Overview Usability (Partial Implementation)

- Sidebar highlighting follows the selected PM, FJ or LJ route and work-request hash. Overview tables, including the equipment-linked work-request table and CAD room list, support fixed-layout resizable columns, persistent widths, single-line ellipsis and full values in cell titles. Column sorting, filters, visibility and ordering remain available.
- Equipment defaults to the In Service filter, with all eight official statuses available through the toolbar and Status column. Legacy Active, Under Repair and Decommissioned values normalize to In Service, Repair and Out Of Service respectively; unknown statuses are rejected rather than silently converted. Saved site data is retained. The versioned seed cache continues to read older versions, and the confirmed reset replaces only the active site's persisted data.
- Equipment hierarchy levels have distinct colors and the selected record is highlighted. The Comments tab contains human comments with previous versions and automatic logs for saved equipment field and document changes. Logs and comments persist with the equipment; editing a comment is restricted to its original actor.
- The new demo seed contains all eight statuses, equipment comment history and synthetic room polygons on every site. Synthetic and generated sample CAD geometry is identified as demonstration geometry, not a surveyed floor plan. The 2D locator resolves the active site's equipment, floor and room, zooms to and highlights the room polygon, and explicitly states that the equipment's exact position is not recorded. Missing or mismatched mappings are reported.
- BIM location is unavailable: the existing BIM viewer simulates IFC loading and does not render or select mapped model elements. No synthetic BIM GUIDs or functional BIM selection are claimed. Exact equipment-coordinate placement and actual IFC loading, mapping and highlighting remain outstanding.

## 23. Dispatch and Leave Management (Partial Implementation)

- The scheduler displays the active site's stored requests and craftspeople, with day, seven-day, fourteen-day and month date ranges, trade groups, a searchable unscheduled/unassigned pool, daily capacity, approved absences, frozen and completed requests. The day view is a daily column, not an hourly timeline. Each assigned craftsperson is charged the request's full expected hours; a frozen request consumes zero capacity only inside its freeze window. Completed and cancelled requests do not consume planned capacity.
- Dispatch supports drag/drop and a pool assignment dialog. It warns for approved leave, mismatched primary trade and planned freezes; scheduling beyond a margin requires a reason and a demo site/trade manager role. Multi-craft requests share a single execution date, and moving that date requires confirmation. These checks are client-side demo controls, not server-enforced authorization.
- Approved absences are persisted per site. Creating an absence exposes overlapping assignments and offers unassignment or capacity-checked reassignment to a primary-trade peer; unresolved conflicts remain flagged. Calendar freeze settings and schedule changes append activity entries. Freeze settings do not transition the work request's central status.
- Reset Demo Data uses seed version 5 and seeds twelve craftspeople per site, dated schedules, multi-person assignments, freeze windows and absences. Existing saved state is retained and old sites without absences migrate to an empty list rather than acquiring seed leave records.
- Outstanding: the full EmployeeProfile fields and secondary trades, a shared multi-select assignment modal in all work-request popups and the bulk toolbar, mobile self-assignment of craftsperson IDs, peer suggestions during drag/drop, hourly day view, and popup-integrated freeze management. Existing `AssignedCraftpersonIds` remains the canonical assignment array to avoid unsynchronized duplicate fields.

## 24. Location Freezes and Resource Calendar (Partial Implementation)

- Location freezes are site-scoped records with a required building and optional floor/room, a local wall-clock date/time range, responsible person, description and PM/FJ/LJ permissions. The Location Freezes page supports creation, editing and deletion using the hierarchy picker and configurable overview table. The state API validates site and location references. Existing saved data is preserved; absent freeze collections migrate to empty, while Reset Demo Data loads the version 6 seed for the active site.
- Conflict checks require an assigned craftsperson and an execution interval, match the site and location hierarchy, respect work-type permissions, and use half-open time intervals. Legacy date-only assignments are treated conservatively as the full local day; due and margin dates do not define freeze windows. Warnings appear in the work-request details and scheduler, and location freezes do not prevent scheduling.
- The existing scheduler now places its pool on the right, supports showing scheduled requests and basic pool sorting/display options, and permits moving work requests with an active WR freeze. WR-specific freeze buttons have been removed from the scheduler. Existing leave and margin guardrails remain independent of location freezes.
- At the end of Section 24, intraday positioning and assignment-time integration were outstanding; Section 25 supersedes those limitations. Dedicated capacity and bulk-editor tabs remain outstanding.

## 25. Hourly Dispatch and Craftsperson Availability

- The scheduler has a WR Dispatch Calendar and a Shifts, Vacations & Trainings management tab. The calendar exposes local wall-clock hours, defaults to 06:00–20:00, supports 0–24h and individual clipping selectors, and can hide weekends in week and two-week views. Week and day headings, hourly slots, an availability legend and the right-side request pool are displayed.
- Timed assignments are stored per craftsperson in `CraftpersonAssignments`, while `AssignedCraftpersonIds` remains authoritative. Dragging to an hour preserves duration; bar handles and +/- buttons adjust in 30-minute steps, and the time editor supports multi-day intervals. Resizing previews capacity before confirmation and persists only on release. Work-request edits and leave resolution remove or move the associated timed records.
- Time intervals use local wall-clock values and half-open overlap comparisons. Capacity apportions timed work across calendar days, combines overlapping timed absences within the shift, and retains legacy date-only and untimed partial-absence compatibility. An untimed legacy partial absence is conservatively shown and checked as an all-day conflict; editing it requires explicit times.
- The availability tab edits same-day shifts, daily capacity, primary and secondary trades and manages full-day or daily partial-hour absence records. Automatic reassignment checks site, trade, shift, leave, overlapping assignments and daily capacity; otherwise the dispatcher can return affected assignments to the pool. Assignment or resizing over leave or off-shift hours requires confirmation. Location freezes remain warnings rather than blockers.
- Reset Demo Data loads the version 7 seed, including timed assignments and vacation, training and sick leave during 7–13 November 2026; existing stored site data is retained until reset. Initial calendar date/time is set after hydration.
- Limitations: shifts cannot cross midnight; multi-day partial absences use the same time range each day; the time editor is opened from a timeline bar rather than immediately after a drop. Timeline interaction and component hydration are tested without launching a browser; full-page hydration, visual layout and browser-specific behavior still require manual verification.

## 26. Scheduler Source Panel and Availability Improvements

- The absence form validates form input locally instead of relying on the shared package's runtime absence-schema export. The portal's development and production build scripts rebuild the shared schema first. Restart an already running development server after rebuilding so it loads the new package output; the state API continues to validate persisted records using the shared schema.
- The dispatch timeline keeps the craftsperson and trade group column sticky while horizontally scrolling. Hour clipping remains adjustable through the two selectors; the 0–24h preset button is removed. Craftsperson filtering supports searching, selecting individual people, selecting all and clearing the selection; selection resets on site change.
- Location Freezes CRUD is embedded as a third scheduler tab. The former `/freezes` route redirects to `/scheduler?tab=freezes`, and the separate sidebar entry is removed. The active tab is reflected in the URL.
- The right-side source panel is horizontally resizable and supports draggable cards or a sortable, horizontally scrollable list. Displayed fields and card/list mode are saved in browser localStorage. Type, contextual status, trade, building, due date, scheduled state and free-text filters apply to the source pool independently of the timeline filters. PM/FJ-only status options are shown when LJ is disabled; enabling LJ adds its quotation and acceptance stages. Work requests retain their detail-popup actions and freeze indicators.
- Each classical trade has a consistent colored badge and left border in the source panel and on timeline bars. Without browser validation, actual sticky scrolling, resizing and layout still require visual verification.

## 27. Multi-Craftsperson Dispatch and Calendar Locator

- The dispatch toolbar and WR source pool provide searchable, multi-select trade and building filters with Select All and Clear. A cleared filter selects no values; Select All includes every value, including newly added site buildings. Craftsperson filtering remains independent.
- Each assigned craftsperson can have a separate local wall-clock interval in the existing `CraftpersonAssignments` array, with `AssignedCraftpersonIds` as the authoritative membership list. Names and duration are derived from craftsperson records and interval endpoints rather than duplicated. Dropping a request or another person's bar onto a craftsperson adds or updates that person's slot without removing other assignees; existing date-only assignments are materialized before the shared date changes. Existing conflict and margin confirmations still apply.
- Scheduled requests are visible in the source pool by default. Show targets a single scheduled assignment directly or prompts for one when several exist. The calendar adjusts its date, weekend and hour clipping, craftsperson, trade, building, availability, type and status filters; it expands the trade group, scrolls to the assignment, and highlights its lane and bar for five seconds or until another click. Legacy date-only assignments use their existing inferred interval.
- Reset Demo Data loads the version 8 site seed with multiple independent assignments on two PM requests and an LJ per site. Existing data remains intact until reset. Timeline positioning, scrolling and multi-select behavior are covered by component tests without launching a browser; manual visual verification is still needed.

## 28. Dispatch and Workforce Upgrade (partial)

- The source pool offers Unscheduled, Scheduled, and Scheduled & Unscheduled filters. A scheduled request has at least one effective timed assignment, including a legacy date-only assignment. Weekends are hidden by default in week, two-week and month views.
- Pool items and timeline bars use a compact two-hour drag image. The timeline retains edge resizing and provides an unschedule action for each assignee, including in the time editor. Unassignment is audited, preserves other people's intervals, and retains recorded labor time; zero-time labor entries for the removed person are discarded.
- PM, FJ and LJ labor tabs share a sortable, filterable table based on assignments and legacy labor. It permits editing actual minutes and rate, displays planned times, estimated cost and availability/freeze warnings, and links a scheduled person to an isolated, highlighted scheduler view. A stale focus link locates the current assignment and informs the user when it has moved. Clearing isolation restores the other calendar work.
- The enterprise workforce package, including shift types, overnight shift capacity, roster overrides, bulk operations, detail drawer and workforce audit, remains unimplemented. Demo seed version 8 is unchanged; it does not contain the requested shift mix or new leave records.

## 29. History and Calendar Freeze Visibility (partial)

- PM, FJ and LJ history panels start at 190 pixels and can be resized using the top drag handle or keyboard, or expanded to 75% of the popup height and restored. A comment composer is available at the top of each history panel on every tab. Activity, checklist history, and equipment comments are displayed newest first by timestamp, including prior comment versions.
- The dispatch calendar includes a sticky Location Freezes band with hour-clipped bars for existing single-location freezes at the active site. Hovering, focusing or selecting a bar highlights affected scheduled assignments; selection shows details and allowed work-request types.
- Multi-location freezes are supported as described in Section 30. The requested craftsperson overview/detail workspace, shift presets, roster, overnight capacity and audit package remain unimplemented; the seed version has not been bumped.

## 30. Multi-location Freezes and Pool Columns (partial)

- Freeze records may specify `buildingIds`, `floorIds`, and `roomIds`; legacy single-location records retain their original hierarchical matching and can be edited without changing their scope. The location pickers allow multi-selection, parent inclusion, top-down filtering and cascading removal. Multi-location freezes match any listed building ID, floor name or room code at the same site, as requested. Floor names and room codes are not globally unique in the location hierarchy, and including parent buildings makes the freeze apply to those whole buildings; the editor warns about this broad scope.
- The calendar freeze band and location warning surfaces display the selected locations. The state API validates selected locations within the site before accepting updates.
- The WR pool supports persistent field visibility, order and list-column widths, shared between card and list views. List headers offer ordering, sorting and resize controls.
- The unified craftsperson shift workspace and its date-specific/overnight scheduling behavior have not been implemented. Existing scheduler and SmartPM workforce views remain in place.

## 34. Technical Audit Follow-up and Reporting

- A failed selected audit can atomically create an FJ or LJ corrective follow-up linked by `OriginatingWR_ID` (and `ParentPM_WR_ID` for a PM). It inherits the parent's site, location, equipment and trade, starts at the configured corrective 50% status, and is recorded in both requests' activity. The job type is an inspector selection, not an automatic cost estimate. QA follow-up numbers use site-partitioned six-digit sequences for the current year, with a cross-site collision check on disk commit.
- Inspector checklist findings are appended to checklist history and WR activity; QA photos are saved with their own activity entry. Both require the revision-checked disk sync. Photos are stored inline in the state and subject to the state API's size limit.
- The shared QA dashboard groups completed requests by month or week. Its compliance bars count completed inspections separately from pending selections; its pass-rate breakdown excludes pending selections and treats corrected or verified failures as rework. Older records without a recorded completion date use their last update or creation date, so historical period attribution is approximate. Open-issue age uses the recorded inspection timestamp.

## 35. Staged QA Selection and Inspector Permissions

- Each site's saved state contains inspector assignments by person, trade and work-request type, and an ordered failure-reason list. Existing site states receive the demo defaults when loaded; a Site Administrator can edit inspector assignments and an assigned inspector can maintain failure reasons. These checks use the demo person switcher and are application-level controls, not a substitute for server-enforced authentication.
- 78% and 100% requests can be staged, unselected, or confirmed for inspection. Confirming records the inspector in activity; only confirmed inspections expose verdict controls. Quotas count staged, confirmed and inspected requests, with reopened failures retained in their original completion cohort. Random selection targets the remaining overall gap within selected filters and balances trade and type selection percentages. If permissions or available candidates cannot fill the requested gap, no selections are committed and the error is displayed.
- On failure, a predefined reason is required and reopening is enabled by default. Reopening validates the configured 50% status and records an issued status with the `Re-opened (50% - QA Failed)` substatus; the inspector can instead retain the existing status. Existing holds must be resolved or explicitly overridden before reopening. Open QA rework must be verified before closing. A QA confirmation or correction does not bypass the normal work-request closing gates.
- Browser quota errors do not display a storage banner. Disk synchronization still reports connectivity and conflict errors; unsynchronized changes that could not be cached can be lost on reload.
- QA actions update the displayed snapshot optimistically after synchronization and revision checks, then commit it to disk. A failed disk write rolls back the optimistic change when no newer local edits exist; concurrent edits are retained and flagged for conflict resolution. A browser-cache error after a successful disk commit is reported separately and does not undo the committed action.

## 36. QA Verdict and Scope Refinement

- The 5% QA audit pool, selection, verdicts, quota and BI include only PM and FJ requests. LJs follow their own acceptance workflow; existing LJ QA data is retained for historical integrity but is excluded from QA views and does not block LJ closure. New demo LJ records have no QA audit.
- Failure requires a predefined reason or inspector notes. By default, the configured 50% Issued status is restored with the `Re-opened (50% - QA Failed)` substatus; inspectors may keep the existing status instead. Optional corrective follow-ups are FJs. Existing holds must be resolved or reopening explicitly overridden. Failed audits require a submitted correction before verification.
- Inspectors and site administrators manage ordered failure reasons in the dedicated Technical Audits tab. Audit photos may be added or removed by an authorized inspector, with each change recorded in activity. The shared verdict and checklist components provide validation and save feedback in both the audit drawer and work-request popups.

## 37. Mobile and Web Mega-App Upgrade: Part 1

- Work requests may contain `timeSessions`, `laborEntries`, `todoSteps` and `roughScopeNotes`; legacy `MobileWorkSessions` and `CraftpersonLabor` remain readable. Effective labor time uses team leader override, then technician opinion, then recorded timer minutes. Existing legacy working time without session details is displayed as recorded time for compatibility. Labor costs shown in the table are calculated from effective minutes and hourly rate and do not replace the WR's total actual cost.
- On mobile, a technician may start and stop multiple offline-persisted timers, record an opinion on a request already at 78%, and save FJ/LJ step findings and photos. The existing sync queue uploads the work request with revision conflict detection; running timers survive reload. A technician identifier without a matching labor record is displayed as its ID and starts with a zero hourly rate until a rate is entered. This part does not add a mobile transition to 78%.
- FJ and LJ popups have a technician task builder. The locally generated suggestions use rule-based scope splitting, not an external AI model, and must be reviewed for the equipment, permits and safety requirements. Team Leaders and Site Administrators can edit steps and override labor time; changes and assignments are recorded in activity. Application roles use the demo person switcher rather than server-enforced authentication.
- Fresh Section 20 demo seeds include FJ/LJ tasks and example completed time sessions; previously persisted work requests are not silently replaced or filled with fabricated history. An explicit demo reset recreates the seed.

## 38. Mobile and Web Mega-App Upgrade: Part 2

- The mobile site and technician selectors use the site's synchronized craftsperson directory. My WRs includes assignments by craftsperson or user ID regardless of trade; unassigned work is limited by the selected technician's VPA trades and buildings. Both queues offer PM/FJ/LJ type filters and the advanced trade filter uses the profile's VPA trades.
- Opening a request shows an execution hub with location and equipment, scheduling, QA rework and current location-freeze warnings. Timers persist individual start/stop sessions locally, including across navigation and restarts, and synchronize through the offline queue. Completing work at 78% requires an opinion time, no running personal timer or blocking freeze, the configured status, and completed required PM answers with failure evidence or completed FJ/LJ tasks. Long jobs remain on their RFW execution and acceptance workflow.
- PM checklists and FJ/LJ task lists provide step navigation and list mode, incremental offline saves, comments, photos and linked FJ creation. Unsaved photo reads and save failures prevent leaving the checklist. PM answer changes and completion are recorded in checklist history and step audit logs. The sync bridge applies queued WR revisions in causal baseline order; conflicting portal changes are retained locally and reported for resolution rather than silently overwritten.
- Technician identities and site selection remain part of the local demo experience, not authenticated user authorization. Technician and freeze context is available offline after a successful synchronization for that site. Photos are stored as data URLs and each selected image is limited to 2 MB; server state size limits still apply.

## 39. Mobile and Web Mega-App Upgrade: Part 3

- Mobile PM answers show favourable or unfavourable feedback for each answered step, including numeric thresholds and failure-triggering options. Comments, multiple step photos and linked FJ creation are available from the checklist. FJ/LJ tasks can be checked or unchecked independently of their favourable finding; comments and multiple before/after photos are retained with each step.
- FJ/LJ checklist definition is restricted to authorized web users; mobile provides execution only. The web builder uses local rule-based suggestions, not an external AI service, and suggestions require safety review. Capability controls use demo profiles, not authenticated roles.
- Opening the 78% confirmation stops the selected technician's running timer and persists that session before displaying recorded minutes and the separate opinion field. Co-worker minutes are stored as opinion time in labor entries, preserving existing timer values and team-leader overrides; craftsperson IDs are added to the existing assignment list. Completion and the recorded time, opinion, co-workers and optional note are recorded in WR activity.
- Completion and linked FJ creation attempt immediate synchronization after local persistence. If offline or a sync conflict occurs, the UI reports that the change remains queued locally; it does not claim that the portal was updated. Existing freeze, checklist and LJ workflow gates remain in effect. Photo ordering is retained, but photos do not carry a structured before/after label.

## 40. VPA Profiles and Granular Demo Capabilities

- Each site can store user access profiles with multi-trade and building VPA scopes, audit trade and request-type scopes, and granular capability flags. The site role assignments workspace offers a profile matrix, trade and building selectors, and capability presets alongside the existing Long Job role assignments. Reset Demo Data recreates the seeded profiles; older server state without profiles is migrated from its existing users and craftspeople and synchronized with revision checks. An existing profile list, including an empty one, is preserved.
- The mobile queue uses the selected craftsperson's profile for unassigned work, while assigned requests remain accessible regardless of trade or building. Location and equipment selection is scoped to profile buildings and equipment primary trades; equipment without a primary trade is excluded. Follow-up creation, claim and completion use the corresponding capability flags. Profile context is available offline after synchronization.
- The portal applies profile checks to the work-request overview, selected SmartPM, QA, scheduler and popup actions. These controls are not comprehensive across all asset, workforce, freeze and other portal workflows.
- **Security limitation:** Person and technician selectors are unauthenticated demo identities. The state API uses a shared sync token and does not authorize an individual user's VPA or capabilities; clients with access to that token can read and modify site state directly. These application-level controls are not an enterprise security boundary. Production enforcement requires authenticated identities and server-side authorization on every read and mutation, including offline synchronization.

## 41. Role Capability Blueprints

- Each site maintains role definitions and assigns one or more roles to a person. Effective boolean capabilities and audit scopes are the union of assigned roles; role edits update profile permissions for web and offline mobile synchronization. Custom variants can be cloned from a role or created for a person. Removing an assigned variant is blocked until it is unassigned.
- Existing profiles without role assignments are migrated without changing their permissions, using a custom role when no default matches. Known role-title placeholders are removed from the profile directory. Migration uses the existing revision-checked sync; demo reset replaces site data.
- Super Admin governance initializes an empty site with demo data using its current revision. A site with missing or invalid data, a conflicting write, or unavailable synchronization reports an error rather than overwriting it.
- The identity switcher and shared sync token remain unauthenticated demo mechanisms; role definitions and UI governance do not provide server-side authorization.

## 42. Mobile Concurrent Timers and Checklist Gate

- A technician must have an open timer session on a PM, FJ or LJ before editing its checklist or to-do steps. The execution hub can start the timer and open the checklist in one action. If synchronization ends the session while the checklist is open, editing is locked until timing is restarted; unsaved progress can still be saved and the view exited.
- Multiple work requests can be timed concurrently. Open and completed sessions remain authoritative on each offline work request and synchronize through the existing revision-checked queue. A per-site localStorage index is rebuilt from the offline requests for quick inspection; it does not replace them as the source of truth. Stopping a session records at least one minute and preserves the technician's opinion and team-leader override.
- The mobile header includes a running-timers bar, and the Timers tab lists running sessions and sessions completed today for the selected site and technician. Timer cards open the work request hub and focus its stopwatch. Navigation out of a checklist waits for its pending save and refuses to discard an in-progress photo read or failed save.

## 43. Mobile Schedule Agenda and Field Escalations

- My WRs groups the selected technician's assignments by overdue, today, upcoming date and unscheduled work, with schedule filters. Planned slots use site-local wall-clock time; a date-only assignment becomes overdue after its date. Schedule timing never prevents starting work, and an early start is recorded in WR activity.
- Technicians can report access, tools, parts, delays and other issues with an urgency and required comment. Reports are saved locally before an immediate synchronization attempt. When offline or conflicting, the device reports that the update remains queued and advises direct contact. The dispatch calendar displays open and acknowledged updates, prioritizes urgent blockers, and permits scheduling-authorized users to reply, acknowledge or resolve through a revision-checked commit. Replies appear on the technician's WR after synchronization. Background mobile synchronization is attempted every five seconds when online.
- New demo seeds include two example field alerts per site; existing saved data is not modified to fabricate reports. Reset Demo Data replaces the site state with fresh examples. These notifications are not a guaranteed real-time communication channel, and the UI explicitly prompts technicians to call or speak to their Team Leader when blocked. Demo identities and capabilities do not constitute server-side authorization.

## 44. Mobile Time Confirmation and Technician Step Builder

- Mobile choice buttons visibly indicate their selection. The execution hub and completion dialog display human-readable planned and recorded session ranges. Completion requires confirmation of the displayed time; a blank opinion uses the recorded minutes, while a valid explicit opinion and any team-leader override retain their existing precedence. A changed time or assignment requires renewed confirmation.
- FJ and LJ checklist builders on the web offer an editable context prompt and a count of 2–12. They produce exactly that many **local rule-based suggestions**, not AI-generated instructions: labelled context fields inform template text and the full edited prompt is retained as the first step's instruction. A qualified technician must review the brief, steps and safety requirements. Regeneration explicitly confirms replacement of prior steps and their evidence, checks the request and checklist have not changed, and logs the replacement. The portal commits with revision checks.

## 45. Checklist Definition and Execution Boundaries

- Mobile checklists are execution-only for every selected identity. Technicians may answer steps, record findings, comments and photos, and create follow-up FJs; they cannot add, edit, reorder, delete or regenerate checklist structure. An empty FJ/LJ checklist displays a read-only notice.
- Web checklist definition requires the corresponding capability granted by a Team Leader, Technical Officer, Site Administrator or Super Admin role. Craftperson and QA Inspector roles cannot grant definition capabilities; saved definitions and profile permissions are normalized when loaded. A person assigned both a craftsperson role and an eligible role retains only the definition permissions granted by the eligible role. Web FJ/LJ execution responses do not alter step structure.
- These are client-side demo controls, not server-side authorization. The shared sync token and unauthenticated identity selectors do not prevent a direct API client from changing checklist data.

## 46. Staged Technical Audit Reports

- PM and FJ inspection pass/fail decisions are staged without changing the work-request percentage or creating corrective work. Inspectors can unstage and edit decisions or adjust permitted reopen and follow-up options. The inspection table and checklist drawer scroll independently.
- Tab 5 reviews the site batch and records an executive note and recipients. Finalization checks the current inspector's trade, building, work-request type and action permissions for every item, applies existing QA and configured status rules, reserves distinct follow-up IDs and persists all verdicts, follow-ups and the report in one revision-checked site snapshot. A conflict rejects the batch. QA pass closes a 78% request only when the existing role and status-transition rules permit it; otherwise its percentage remains unchanged.
- Reports are archived per site and shown in-app to matching addressed identities on the dashboard and scheduler. Custom names and email addresses are stored as recipients, but no email or external notification is delivered. Identity and permission checks remain client-side demo controls, not server-side authorization.

## 47. QA Rework Monitoring and Team Leader Challenges

- The technical-audits workspace filters tabs by the active profile and capabilities. The inspector card allows authorized users to stage edits to previous verdicts; existing final outcomes remain recoverable by removing the staged edit. A draft on a 50% rework request preserves its failed status so technicians can continue working. Batch finalization still requires 78% or 100% and rechecks scope and permissions.
- Rework monitoring shows checklist evidence, time sessions, comments and challenge history. Site-scoped Team Leaders or administrators can challenge a 50% QA reopening. Opening a request never marks a challenge read: an inspector must explicitly acknowledge each unread challenge. Resolution requires a response, a read acknowledgement, no staged verdict, and no other pending challenge. Acceptance uses the configured 100% status; rejection uses the configured 50% status and requires reopen permission. Both reject frozen requests.
- An authorized inspector can re-check work after the team reaches 78%, provided no challenge or verdict draft remains pending. Passing sets the configured 100% status and QA verified; failing requires a note and reopen capability, increments the reinspection counter and uses the configured 50% status. Both decisions are logged. These explicit inspector actions grant QA authority to close at 100%; they do not change unrelated WR closing flows.
- The commit interface has separate review, recipient and preview cards; analytics and the in-app report archive are separate. Reset Demo Data loads the version 15 seed with an unread challenge and a 78% re-check example per site; existing saved data is not automatically replaced. No external message delivery or server-side identity authorization is provided.

## 48. Inspector-Only Queue and Post-Commit Challenges

- Selecting completed PM/FJ work requests manually, randomly or by QR sends them directly to `ToBeInspected`. Legacy `SelectedForAudit` records are normalized on hydration. The inspection queue shows only uncommitted inspections; individual or bulk removal clears their uncommitted verdict drafts. Previously committed verdict edits retain their committed status and appear in the report batch rather than the queue.
- QA capability resolution strips audit permissions and trade/type scope from Team Leader, Craftperson, Senior Craftperson and other non-inspector roles. An explicitly assigned QA Inspector role, or a Super Admin role, is required in addition to the corresponding inspection capability. Site Administrators can be explicitly assigned the QA Inspector role; site administration alone does not grant inspection. Existing profiles and role definitions are normalized when loaded, while mixed-role users retain permissions actually granted by their inspector role.
- Team Leaders may challenge only a committed 50% QA failure with no staged edit; challenge history is retained, not silently deleted. Uncommitted selections cannot create challenges. The inspector card no longer displays correction comments. Reset Demo Data loads the version 16 seed; previously saved user records and work-request history are preserved. These remain client-side demo controls, not server-enforced authentication.

## 49. Technical Audit & Assurance — Section 47, Part 1

- Audit campaigns, findings and inspection routes are separate from work-request QA audits and are persisted in the site-scoped CAFM snapshot. Fresh demo data and Reset Demo Data contain three campaigns per site and 18 example findings per site. Existing snapshots without these fields start with empty assurance collections; they are not replaced with demo records. The example intelligence flags are illustrative, not AI-generated decisions, and work-request matches are based on the same equipment and status.
- Discovery dates and deadlines are UTC calendar dates: N4 is immediate, with the 24-hour boundary at the start of the next UTC day; N3, N2 and N1 are due 90, 365 and 730 days after discovery, respectively, and become overdue after their due date. N0 has no action deadline. Overdue status is computed live and excludes closed or archived findings.
- The overview, campaign workflow, persisted asset inspection routes and finding register operate within the active site. Campaign creation derives building and system scope from selected registry assets and creates one route entry per asset on the campaign start date. Inspectors can record accessibility without a finding or log a finding against a route; inaccessible routes remain planned until accessible inspection is recorded. A newly created campaign's zero ratings mean not yet scored; no automatic score is inferred from individual findings. Campaign stage changes and creations use revision-checked snapshots.
- The workspace's change controls require the active QA Inspector capability and profile. As elsewhere in the demo, identity and permissions are client-side controls, not server-enforced authentication.

## 50. Technical Audit & Assurance — Section 47, Part 2

- The validation workbench compares findings with the live registry, related requests and other findings. Duplicate and related-work alerts are deterministic heuristics, not an AI model; recent completion candidates use the request's last update within 30 days, not a verified completion timestamp. Recommendations must be reviewed and classified by a person with justification. Rejected findings remain searchable and retain their audit trail.
- Validated actionable findings can create FJ/LJ work, or a collective job for findings sharing a room and trade, using the configured 50% corrective status. Each finding becomes a technician to-do; its observation, remedy, urgency, deadline and photo references are carried to the work request. The creator must also have the relevant WR creation capability. N1/N2 findings can be added to an existing unfrozen open PM with checklist-definition permission; the original blueprint is not modified. Investment proposals are stored on findings, not represented as approved or funded projects.
- Site snapshot writes reconcile linked WRs at 78% and subsequent completion/acceptance stages through 100% into work-completed/awaiting-evidence, including mobile sync. If the WR reopens below 78% before verification, evidence acceptance is invalidated and the finding returns to work-in-progress. Completion never automatically closes a finding. Reviewers separately accept or reject evidence and then explicitly verify it. Low-risk verification is limited to N1/N2 with accepted before/after photo references and measurements; external and next-inspection verification require the reviewer to confirm those events in their notes.
- The condition map displays stored room polygons and approximate room-centre asset markers, not surveyed equipment positions or navigable routes. Demo and sample CAD geometry remains marked as such. BIM GlobalId and drawing revision can be maintained on the equipment registry with equipment-management permission, but the existing BIM viewport does not render a real IFC model. There is no inferred drawing revision, external AI service, external sign-off verification or server-side user authentication.

## 51. Technical Audit & Assurance — Section 47, Part 3

- Trends use only accepted contractor-responsible findings, excluding unclassified findings, owner responsibility, duplicates and archived/rejected findings. Inspection denominators count distinct completed campaign/asset pairs. Evidence acceptance uses recorded review events; closure duration runs from discovery to independent verification in UTC calendar days. A finding is evaluated for SLA when verified or past the configured target; unexpired open findings do not inflate compliance. The illustrative net amount is on-time verified findings multiplied by the per-finding bonus, less evaluated noncompliant findings multiplied by the per-finding malus. Both rates default to zero and must not be treated as an agreed contract or invoice.
- Site settings configure future finding deadlines, SLA targets, illustrative financial weights and whether the existing controlled-low-risk verification option is available. Existing deadlines are not rewritten. N0 has no deadline. The N4 cutoff is the start of the target UTC day; other urgency deadlines run through their target UTC day. Low-risk closure remains a deliberate reviewer action, not an unattended auto-close.
- Site checkpoint libraries are independent of PM blueprints; changing a library does not alter historical inspections. Fresh demo resets contain example categories, while old saved snapshots are not overwritten. PDF reports are generated outputs; the structured finding register remains authoritative. Spreadsheet rows are staged and approved individually before revision-checked import into pending technical validation. The importer matches exact equipment codes and requires an in-scope asset and explicit urgency, condition and operation; unknown contractor information must be corrected by the reviewer. PDF upload creates a blank manual-transcription stage; the PDF is not stored or parsed, and no AI extraction or fuzzy asset matching is provided.
- Mobile auditors can load site campaigns, routes and templates when online, then record signed findings and images offline in the IndexedDB sync queue. Sync checks the current site, inspector profile, trade/building scope, campaign and equipment location, rejects conflicts without discarding local work, and uses mutation IDs for retry safety. Selected route results update completion and accessibility on sync. QR image decoding requires native BarcodeDetector support; otherwise manual lookup is available. NFC is simulated. The floor plan picker uses stored room polygons and room-centre pins, not surveyed equipment positions. Inspector identity and permissions remain demo client controls rather than server-authenticated identity.

## 52. Sophia Equipment Checkpoint Sheets — Section 48

- Checkpoint sheets and templates are stored in the site snapshot under `auditAssurance`; completed sheets retain their scoring configuration and are read-only. The seed includes all 22 named AHU checkpoints, with Antifreeze and Pump marked NA for the 20-applicable-checkpoint Rosetta example. The example uses 15 N0 checkpoints, four N1 checkpoints and one N2 checkpoint. Reset Demo Data loads the version 17 seed; previous snapshots are retained and do not receive fabricated sheets.
- The illustrative KMIS calculation multiplies each checkpoint weight by its classification multiplier, sums the weighted classification totals, divides the sum of those totals times their point values by the sum of the scored totals, multiplies by the configurable calibration factor, rounds and clamps to 0–100. The default multipliers are 1, 0.9375, 1, 1, 1 for N0–N4; points are 100, 45, 0, -50, -100; calibration is 0.9231460674. Thus Rosetta displays 15.00, 3.75, 1.00 and 78%. This calibration is illustrative, not a contractual or independently verified KMIS formula. NV, ST and NA are counts excluded from the denominator. A sheet with no positive scored weight displays “Not scored”; its numeric persisted score is a zero sentinel and it does not overwrite the equipment rating.
- By default a completed sheet creates pending-validation findings for N2–N4 and N1 checkpoints with comments; each classification's generation rule can be disabled. Finding IDs link to the originating checkpoint; subsequent technical validation remains mandatory. The sheet, findings, asset rating and route progress are saved together. Inaccessible routes remain planned. Default contractor attribution and remedy are review prompts, not confirmed responsibility or completed work. Completed sheets cannot currently be revised in place.
- The web schedule allows an inspector to select a route and an appropriate template; campaign and finding drill-down views link to the schedule. The mobile app uses an assigned route and queues a complete sheet offline; synchronization rechecks inspector scope, campaign, location, route, template and current scoring configuration, retaining conflicting entries on the device. Retry IDs avoid applying a queued sheet twice. Only the AHU checkpoint template is seeded; additional equipment-category templates are not yet provided. Identity and authorization remain demo client controls rather than server-authenticated identity.

## 58. V8 Checklist Signals, Follow-Up Linkage and Completed Mobile Review

- Mobile release V8 uses the `cafm-mobile-v8:` service-worker cache namespace. Filters are live: changing or dismissing the sheet retains the current criteria. The sheet sits above navigation, and Done closes it without a separate apply step. Percentage keys normalize numeric and text representations; explicit substatus selections never fall back to active work. WR IDs match case-insensitive trimmed substrings, including legacy identifier aliases. List, compact and calendar views (including undated WRs) use the same filtered pool and schedule criteria; tab counters use that exact pool. Empty results offer Reset Filters.
- The web overview places Signals / Alerts beside Substatus %. Unfavourable counts use the same recorded finding evaluation as checklist review: current result `passed` takes precedence over completed instance `IsFailed`, with technician to-do findings supported for FJ/LJ. Toolbar toggles filter the current site, VPA scope, queue and overview criteria in both grid and card views. Unfavourable badges open Checklist - Smart PM directly, and PM follow-up badges open PM Follow-up directly. Their tab headers show counts. FJ/LJ retain their existing execution tabs and gain a checklist review tab.
- Follow-up lookup supports `ParentPM_WR_ID`, `ParentWR_ID`, `parentWrId`, `sourcePmWrId`, `OriginWR_ID`, `OriginatingWR_ID` and the PM's `FollowUpFJIds`, without crossing sites. New PM follow-ups stamp the canonical parent aliases, optional originating checklist step ID/label, and both timestamp spellings on parent and child. Mobile writes both records and queue mutations in one IndexedDB transaction with baseline conflict checks; synchronization still uses the existing conflict-retaining protocol. Web PM and QA creation update both records in the same snapshot. PM follow-up lists show FJ ID, title, status, percentage and step, with direct FJ navigation. FJ cards, grid signals and detail banners link back to the parent PM.
- Mobile WRs at 78% or above display an emerald completion summary, recorded-time/session summary, checklist review, comments/photos and an authorized follow-up action instead of execution controls. Completed WRs cannot start timers. Checklist review does not require timing or freeze acknowledgment. Answers are read-only by default; authorized technicians may explicitly unlock amendments only at 78%, retaining answer history and audit logs. Later approval/closed statuses remain read-only. Work at 50%/55% retains the timer and freeze-gate flow.
- Validation for this upgrade uses the unified cloud build and TypeScript checks in both applications; browser automation and test suites are not part of this verification.

## 59. V9 Nested SmartPM Cycles, Checklist Inheritance and Compliance

- Mobile release V9 uses the `cafm-mobile-v9:` service-worker cache namespace. The demo storage key advances to v20. Reset Demo Data explicitly installs the new examples; existing persisted sites are not silently replaced.
- Shared frequency ranks are `01D:1`, `01W:2`, `02W:3`, `01M:4`, `03M:5`, `06M:6`, `01Y:7`, `02Y:8`, `05Y:9`. Procedures and schedules support `frequencyCode`, `suppressionMode`, group key/name, shared anchor and collision window. An omitted mode means `suppress_and_inherit`; an empty group remains ungrouped. Schedules are authoritative; new assignments inherit procedure defaults. Explicit frequency codes take precedence over legacy Frequency/Interval.
- Only active schedules on the same site, equipment and nonempty group key form a cancelling ladder. Independent statutory tracks never cancel or get cancelled. Monthly and longer frequencies default to a 14-day collision window, weekly to 2 days, daily to zero. A collision must fall within both schedules' windows. Stable rank/date/ID ordering makes results deterministic. The shared anchor is cycle zero, with the first tick one interval later; month-end clamping always derives from the anchor, avoiding cumulative date drift.
- SmartPM and Scheduler share the pure suppression engine with demo generation. Preview supports 12/24 months and includes boundary lookahead. For a January 15 anchor, 03M/06M/01Y yield April 15 03M, July 15 06M, October 15 03M and next January 15 01Y: four WRs instead of seven. Generation plans sibling schedules before emitting any WR, including covering ticks just beyond the horizon, retains cycle deduplication and advances consumed cycles. A selected lower schedule may generate its higher covering sibling instead.
- Checklist compilation snapshots ascending lower-frequency delta steps plus the target procedure, with origin frequency and inherited flags. Higher steps may replace a lower step ID in that same ladder; replaced lower steps are omitted and the replacing step retains a readable replacement label. Duplicate step IDs or invalid replacements fail explicitly. Quarterly four checks plus two semiannual additions plus three annual additions replacing one quarterly check produce eight annual checks. Inherited steps are read-only in layered authoring; only delta steps and replacement selections are editable.
- The reconciler cancels only unstarted 50% lower-frequency duplicates, preserving timers, answers, labor and executed scopes. It links the cancelled WR to its covering WR, compiles the winner, merges absorbed frequencies, preserves immutable step audit history and records newly instantiated steps. Started/completed winners cover lower work only if their recorded scope already contains the required inherited checks. Single-equipment WRs are reconciled conservatively; multi-equipment legacy WRs are not cancelled wholesale.
- `suppressedPmOccurrences` is a validated site-scoped persisted collection with stable occurrence IDs, equipment, group, suppressed/covering frequency, target date, covering WR ID and timestamp. Web conflict merges preserve ledger entries. Mobile validates and retains the collection through API round trips and IndexedDB site context. Old saved states without this collection start with an empty ledger, not unrelated seed entries. SmartPM and equipment WR/compliance history expose the audit table and covering references.
- SmartPM includes suppression-group cards, editable mode/group/anchor/window controls, schedule assignment/movement, a ladder strip, live cycle/date/count/savings previews, a layered checklist editor, and an explicit reconcile action. PMS and PMP editors surface the same settings. Existing permission and VPA restrictions apply to these actions.
- PM rows/cards, scheduler slots and mobile card/compact lists show frequency pills and absorbed-frequency indicators. WR detail/checklist views show the total scope banner. Web checklist rows and mobile all-steps mode have origin-frequency sections; mobile step-by-step mode shows the origin pill and replacement note.
- Each site's demo still has 90 WRs (81 PM). AHU, heating boiler, chiller and diesel generator assets have 03M/06M/01Y ladders with four surviving annual-cycle WRs each and real covering references in the Q2/Q4 suppression ledger. Boiler and chiller also have independent annual statutory safety inspections. Gregor has active 50% quarterly, inherited semiannual and eight-step annual examples, with no overlapping grouped frequencies.
- Verification uses `node scripts/build-cloud.cjs` and `npx tsc --noEmit` in shared-schema, web-portal and mobile-app. No browser automation or test suites are run for this section.

## 60. V10 Blueprint-Owned PM Families and Five-Digit Orders

- Mobile release V10 uses `cafm-mobile-v10:`. Web demo storage advances to v21, retaining prior storage keys for migration; Reset Demo Data explicitly installs the new shared multi-equipment examples without silently replacing saved sites.
- This section supersedes Section 59's schedule-owned rules. Every canonical checklist blueprint declares one locked `frequencyCode` and a `blueprintMode`: `family_ladder` with `familyId`/`familyName`, or `standalone`. A family has one blueprint per frequency and one trade. Existing blueprint frequencies cannot be changed through the editor or state API; create a new blueprint instead.
- Family blueprints own delta steps. The shared `compileBlueprintChecklist` compiles all active lower-rank blueprints in the same site/family, even when those lower blueprints are not assigned to the equipment. It preserves origin-frequency/inherited markers and applies validated lower-step replacements with readable labels. Duplicate step IDs, ambiguous families and invalid replacement targets fail explicitly. Standalone checklists never participate in another family's inheritance or suppression.
- PMS orders are single-equipment blueprint assignments with a shared family anchor and optional execution-slot defaults. Canonical order IDs are `00001` through `99999`; `nextPmsOrderNumber` increments the current maximum. API reads provide a global persisted high-watermark so site-scoped creation does not reuse another site's IDs; locked writes reject concurrent allocation collisions with a refresh/retry error. Migration resolves legacy cross-site collisions and rewrites WR, checklist-instance, auto-slot and compliance references consistently.
- Blueprint rules derive compatibility Frequency/Interval and suppression fields at state boundaries and before generation; individual PMS overrides are not authoritative. Equipment-family anchors are synchronized across that machine's orders only. A second machine can reuse exactly the same blueprints with a different anchor. Standalone orders retain independent anchors. The anchor remains cycle zero; the first occurrence is one interval later.
- Suppression uses automatic windows: daily zero, weekly/biweekly two days, monthly five days, quarterly and longer fourteen days. Highest-rank assigned orders win only within the same site/equipment/family. Generated WRs carry `pmsId`, `pmFrequency`, standardized compiled checklists and assigned lower `absorbedFrequencies`. The persisted ledger exposes `suppressedPmsId`, `coveredByPmsId` and `coveredByWrId`; existing cycle deduplication and conservative execution-aware reconciliation remain in force.
- SmartPM opens with exactly four tabs: Checklist Blueprints & Families; Equipment PM Plans; All PM Schedules; WR Generator & Suppression Audit Log. The workspace provides visual family ladders, locked frequency/delta authoring, inherited previews, bulk multi-machine assignment, equipment-family anchor controls, compiled-scope previews, exact twelve-month output/savings strips, master-order filters, generation/reconciliation, compliance links and craftperson VPA management. Permission and VPA restrictions remain enforced.
- Legacy boundary schemas accept old records for deterministic migration before canonical validation. Legacy multi-equipment schedules split into single-equipment orders, with equipment-specific WR mapping. Executed checklist snapshots and step audit values are preserved. Duplicate active assignments are retained inactive with visible migration notes. Missing-equipment legacy schedules fail with an actionable error instead of inventing equipment or dropping history.
- Demo data has 42 five-digit orders and 90 WRs per site, including 81 PMs with the existing status distribution. Shared Chiller Routine Mechanical (`01M/03M/06M/01Y`), Boiler Routine Mechanical (`03M/06M/01Y`) and AHU Routine Servicing (`03M/06M/01Y`) families are reused across two machines each with January 15 / February 1 anchors. Generator Electrical Servicing has `01M/06M/01Y`; statutory annual inspections and daily technical tours are independent. Five tour rules per site retain scheduler defaults. Legacy long-ID schedules are absent from reset seeds.
- Verification uses `node scripts/build-cloud.cjs` and explicit `npx tsc --noEmit` in shared-schema, mobile-app and web-portal. No browsers or test suites are used.

## 61. V11 Audited Checklist Corrections, Location PM Plans and Forward Schedule Shifts

- Mobile V11 uses `cafm-mobile-v11:`; Web demo storage advances to v22 with legacy-key migration. Reset Demo Data explicitly installs the new examples. No saved site is silently replaced.
- A shared checklist-correction writer compares saved answer content, result, comments and evidence, not correction metadata or timestamps. Correcting a previously answered PM or FJ/LJ checklist appends `[Checklist Correction]` entries to WR activity/history, checklist history and structured step audit logs with exact old/new payloads, actor and timestamp. Modified results, step snapshots and technician steps retain `lastCorrectedBy`, `lastCorrectedAt` and `previousValue`; Web and Mobile show amber correction notes. WR timestamps are updated for synchronization. Mobile's optimistic conflict check compares answer content so its own correction metadata does not cause a false concurrent-edit conflict. Existing completion/amendment permissions remain in effect.
- Site state persists an append-only `blueprintAuditLog` with ID, site, blueprint code, action, summary, full before/after snapshots, actor and timestamp. The state API records existing-blueprint revisions, including title/hours, step addition/edit/deletion/reordering and replacement changes, retaining prior server entries rather than trusting a client to rewrite history. Blueprint editors show collapsible Blueprint Change History; Tab 4 shows blueprint revisions and WR checklist corrections beside suppression records.
- Families use sequential `FAM-001` identifiers within their site. Blueprint codes use a globally allocated four-digit sequence and locked-frequency suffix, such as `CB-0001-03M`; code previews are read-only and change suffix when the creation frequency changes. Saved frequencies remain locked. Boundary migration renames legacy codes/families and preserves schedule, WR and checklist-instance references. API high-watermarks reserve seed ranges; concurrent cross-site number conflicts fail explicitly. Reset normalizes number collisions and the Web store adopts the returned canonical state.
- PMS targets support equipment, building, floor and room. Equipment keeps one `EquipmentCodes` entry; location orders keep an empty array and identify their parents through `bl_id`, `LevelName`/`levelName` and `RoomCode`/`roomCode`. Shared helpers derive `EQ:code`, `BL:building`, `FL:building|floor` and `RM:building|floor|room` keys. Suppression, checklist inheritance, shared anchors, previews, generation, reconciliation and compliance records are scoped by site, target key and family. Canonical schema/API validation rejects incomplete or nonexistent target hierarchies. Location PMs are valid without equipment; Web WR grids/cards, scheduler source/timeline and Mobile cards/compact/calendar/details display a location target label.
- Tab 2 is Equipment & Location PM Plans, with Equipment / Locations master-list switching, target-family cards, shared phase, compiled scope and live annual output previews. Tab 3 is a sortable enterprise schedule grid with per-column inline text filters for every requested field, a pinned Select column, visibility controls, drag reordering and arrow move controls, Reset Columns and Reset Filters. Column order/visibility persist in `cafm_pms_table_prefs_v1`; storage failures are displayed.
- The assignment dialog is a wide, independently scrollable two-column workspace with a sticky anchor/summary/action footer. Blueprint search, family/standalone filtering, trade/frequency selectors and Select Entire Family combine with equipment/room/floor/building targets, target search, building/floor filtering, Select All Filtered, Clear and selection counts. Duplicate active target/blueprint orders are skipped; existing family anchors are retained. Permission and VPA restrictions apply to all listed targets and mutations.
- SmartPM no longer contains craftperson management. Tab 4 contains only generation, conservative overlap reconciliation, suppression references and blueprint/checklist change history; craftperson and default-scheduling management remain in Scheduler.
- Existing anchors are changed through Change Schedule Date / Day, not raw inline overwrites. The user identifies the current cycle and new future-effective target date and chooses Move open unstarted 50% WRs (default) or Keep issued WRs and apply from the next cycle. An exact day offset shifts the original family anchor without restarting annual/multi-year clocks. Orders persist `effectiveFromDate` and append schedule-change records with actor, old/new anchors, cutover, action and retained cycle mappings. Generation starts at or after the cutover and recognizes retained cycle identities to prevent duplicates. Started/completed WRs are never rewritten. Moved unstarted WRs receive shifted Start/Due/Margin dates, shifted auto-slots, updated cycle keys and `[Schedule Shifted]` activity.
- Reset seeds retain 90 WRs per site, including 81 PMs and the existing status distribution. Each site has 51 five-digit orders, including six location orders and six active 50% location WRs. Five distinct families are Chiller Routine Mechanical, Heating Boiler Servicing, Cleanroom AHU Servicing, Diesel Generator Servicing, and Building & Room Safety Inspections. Mechanical/electrical families reuse blueprints across two assets each; the safety family is shared across building/floor/room targets. Standalone statutory inspections/tours and five scheduler-default rules remain intact; no duplicate legacy assignments are reintroduced.
- Verification uses `node scripts/build-cloud.cjs` and `npx tsc --noEmit` in shared-schema, mobile-app and web-portal. Browsers and test suites are not run.

## 62. V12 Visit-One Cycles, Ten-Year Forecasts and Standardized Dates

- Mobile V12 uses `cafm-mobile-v12:`. Web storage advances to v23 with migration of older keys. Reset Demo Data loads 53 PMS orders and 90 WRs per site, including a reusable Diesel Generator 10-Year Major Overhaul blueprint on both generator targets.
- `10Y` is a locked blueprint/schedule frequency with 120 calendar months and rank 10. All selectors derive from the shared frequency configuration. Internal dates and sync payloads remain ISO.
- This section supersedes the cycle-zero and collision-window semantics in Sections 59-61. `cycleDate` is literally Visit #1 for the shortest assigned frequency. Site/target/family siblings share that date and `peakSlotIndex`; standalone orders remain independent. Legacy cycle-zero anchors migrate forward by the shortest assigned interval exactly once, without rewriting issued/executed WR history. Compatibility anchor fields mirror the new cycle date.
- The macro-cycle is the LCM of assigned intervals, not just the largest interval: `02Y + 05Y` spans ten years. Visit n occurs at cycleDate plus (n-1) shortest intervals. A frequency is due exactly when the normalized signed modulo of (n-peakSlotIndex) shortest intervals by its own interval is zero. Highest rank wins and all coincident lower frequencies are suppressed. Month-end dates derive from the original cycle date without cumulative drift. Fixed-day/weekly ladders and calendar-month ladders use their respective units; mixing these incompatible units in one family fails with guidance to use separate families.
- Peak selection supports a one-based visit index and derived annual-slot/multi-year-position fields. Quarterly/semiannual/annual ladders rotate as `01Y,03M,06M,03M`; `03M,01Y,03M,06M`; `06M,03M,01Y,03M`; or `03M,06M,03M,01Y` for peak positions 1-4. The shared next-occurrence helper searches actual winning visits on/after the reference date and reports visit number and executions per macro-cycle.
- Target lists show exact post-suppression annual averages. Family and standalone plan tables show Cycle Start Date (Visit #1), peak position, Next Occurrence and full-cycle savings. All PM Schedules displays true unsuppressed Next Due with ISO-based chronological sorting and formatted text filtering.
- Change Schedule Date / Day opens a wide live calculator with a cycle-date input, peak slot and multi-year peak-year controls. Preview recalculates before saving, includes per-frequency next dates/counts and every macro-cycle visit, groups multi-year output by year, and supports All/03M+/01Y+/Multi-Year filters and setting the peak directly on a visit. A monthly ten-year cycle has 120 visits and 12 WRs/year, not separate duplicate WRs for every coincident procedure.
- Applying the calculator changes future cycle phase and position together. Move shifts only unstarted 50% WRs into unique winning slots of their own PMS, preserving Start/Due/Margin offsets and automatic time windows. Keep leaves issued WRs untouched. Started/completed requests always remain unchanged. Schedule audit entries record old/new cycle dates, old/new peak positions, actor/time, effective cutover and retained identities. Generation treats retained target-family visits as consumed, preventing duplicate regeneration without claiming newly executed checklist scope.
- Shared `formatDateDDMMYYYY`, `formatDateTimeDDMMYYYY` and `formatDateRangeDDMMYYYY` render dates as DD-MM-YYYY, timestamps as DD-MM-YYYY HH:mm and ranges with both dates when needed. Reusable Web/Mobile date inputs accept/display strict DD-MM-YYYY and preserve ISO values for callbacks, with native calendar access and explicit invalid-input feedback. WRs, SmartPM, scheduling, freezes, equipment, audits, history and mobile execution use these formatters instead of locale-dependent date displays.
- Validation uses the unified production build and explicit TypeScript checks in shared-schema, Web and Mobile. No browser automation or test suites are run.

## 83. V33 State Write Coordination and Live Checklist Sync

- Mobile V33 uses the `cafm-mobile-v33:` offline cache. Checklist changes are queued in IndexedDB as they are made; the live upload is debounced for 700 ms after the last saved answer. Explicit completion and manual synchronization remain immediate.
- Disk-backed state writes wait up to five seconds for the write lock, retrying at 50–90 ms intervals and removing locks older than 15 seconds. Active writers refresh their lock; Supabase continues to use revision-based conditional writes.
- Passive web views poll for server updates without posting normalization changes. User edits retain their pending work-request IDs and changed fields across reloads. Revision and temporary lock conflicts trigger a fresh read and retry; overlapping changes to the same work request or other edited field are reported rather than silently overwritten. Legacy pending snapshots without edit metadata are backed up in browser storage rather than automatically posted.
- Mobile retries 409 and 503 responses up to four times with increasing 250 ms delays, re-reading the server and reapplying queued mutations on each attempt. Persistent conflicts and connectivity failures remain visible and unsent work stays queued.

## 84. V34 Restored V33 Synchronization and Hardened WR ID Watermarks

- The V33 state-write coordination is restored after a revert: web and mobile sync against the unified `cafm-state` backend with revision-conditional writes, and live checklist uploads remain debounced at 700 ms.
- Work request IDs use a persisted per-site high-watermark under `cafm-wr-watermark:${site}` so sequences survive reloads. `sanitizeSequenceWatermark` strips the 2026 year prefix and rejects any non-integer or sequence above 989999, returning 0 instead of crashing hydration. IDs 9899xx are reserved synthetic bands.
- `allocateWorkRequestId` allocates strictly above the normal high-watermark, wrapping to unused IDs when necessary. Synthetic IDs stay reserved but never advance the normal watermark, so seed bands and demo resets cannot inflate production sequences. Deleted work request IDs are never reissued.
- All IDs validate through `isStrictWorkRequestId`; non-conforming legacy IDs migrate to the strict 2026-prefixed 10-digit form on write.

## 85. V35 Storage Quota Recovery and Confirmed Mobile Freeze Overrides

- When IndexedDB is unavailable or the storage quota is exhausted, the mobile app falls back to a memory-backed database (`memory-db.ts`) so checklists, timers and queued mutations remain usable and sync-safe instead of silently failing. The fallback is covered by `offline-sync-safety` tests and never blocks the sync queue.
- The mobile freeze safety gate alerts technicians to active location freezes before WR execution. The override flag is mount state by design: leaving and re-entering the checklist re-locks the gate, so every freeze override must be re-confirmed.
- Confirmed overrides are audit-logged and apply only at 50% Issued status; the same gate surfaces pending clearances (ESA IT, OCC, Security, Kitchen, Newsflash) and early slot starts. Mobile advances to V35 with the `cafm-mobile-v35:` service worker cache.

## 86. V36 PM and Long Job Lifecycle Governance

- At 78% Technically Completed, PM labor and checklist answers are read-only: incoming states that change `laborEntries`, `CraftpersonLabor`, `CraftpersonAssignments`, `timeSessions`, `MobileWorkSessions`, `ChecklistResults`, `ChecklistInstances` or `ChecklistSteps` are rejected server-side (`wr-governance.ts`).
- Terminal PMs (100% Closed, 27% Cancelled) reactivate only through an administrator action with a double-confirmed governance proof: a reason of at least 5 characters, two sequential confirmations within a 5-second tolerance, a whitelisted field set (percentage/status/freeze/audit fields), `ReopenCount` increment and an `[Admin Reactivation]` audit log plus `ReopenedHistory` entry. Reactivation targets are limited to 50% Issued, 55% On Hold for Access (frozen) or 78% Technically Completed.
- PM Complete (100%) and Cancel (27%) require `pmWorkRequests.complete` / `pmWorkRequests.cancel` permissions held only by SiteAdministrator, TeamLeader and SuperAdmin. Completion must originate from 78% with Closed status; cancellation requires a Cancelled status/substatus and an audit-logged cancellation reason.
- Work requests can never change type between PM, FJ and LJ. Long Job stage changes validate against the transition matrix; arbitrary stage overrides require an `lj-override` proof and are limited to `LJ_OVERRIDE_STAGES`, while normal transitions, shortcuts and acceptance-gate actions (78%-81% SAT, Drawing, CIFM) follow the role matrix.
- Feature permission overrides change only by administrators, and hard-locked features can never be unlocked. The API resolves the acting `actorId` against persisted server user records; governance violations return HTTP 403 and do not modify state.

## 87. V37 Resettable Governance Boundary, Collapsible Navigation and Sync Diagnostics

- The web portal sidebar collapses to an icon rail through a header chevron button; the choice persists in `cafm_sidebar_collapsed_v1` local storage. Collapsed mode hides labels, replaces section headers with dividers and keeps hover/ARIA labels per item. Every navigation address has its own distinct icon, and the header shows `Enterprise Edition · <PLATFORM_VERSION>` from `apps/web-portal/lib/platform-version.ts`, which is bumped each platform release independently of the mobile version.
- `POST /api/cafm-state` skips `validateGovernance` while `forceReset` is true: an explicit, confirm-guarded admin seed replacement replaces site state wholesale and is no longer rejected by 78% PM labor/checklist read-only locks. Structural validations (cross-site duplicate WR IDs, schedule/blueprint collisions, locked blueprint frequencies) still apply to resets. Governance rejections log `{ site, actorId, violation, revision }` server-side and return a `details` object with the 403 response.
- The web store records structured debug context on every sync failure in the browser console: site, active person, actor ID, revision, push vs poll, pending work-request IDs and pending fields, plus the server `details`. The red state-sync banner appends `(HTTP <status>, site <site>)` and reset failures report `Reset failed: <reason> (HTTP <status>, site <site>)`.
- Verification uses `npx tsc --noEmit` in shared-schema, mobile-app and web-portal plus `node scripts/build-cloud.cjs`. No mobile code changed in this round, so the mobile version remains V35.

## 88. V38 Live-Data Dashboard

- The web portal Dashboard computes every metric from the live site state (`useCafmStore`) instead of hardcoded values. KPI cards show: Active Work Requests with the PM/FJ/LJ split (via `isActiveAt`), Overdue WRs with the past-margin count (`isOverdueAt`, `isOverMarginAt`), PM On-Time Compliance as the share of PMs due to date completed by their due date (`completionMs` vs `dueMs`, cancelled excluded), and Registered Craftspeople with the covered trade count. Trend badges are removed because no real baseline exists for them.
- An Overdue Spotlight lists the five most urgent overdue WRs (sorted by due date) with type badges and DD-MM-YYYY due/margin dates, linking into Work Requests. A Recent Activity feed shows the six latest audit-log entries across all WRs with actor names; both sections render honest empty states instead of mock content.
- Quick Actions expand to six operations links (Locations, Equipment, Floor Plans, Preventive Maintenance, Scheduler, Fast Jobs). The stale Sample Data panel with hardcoded counts and Firebase-era text is replaced by a Live Site Data summary showing real building/floor/room/equipment/WR counts and describing the revision-based sync backend.
- The dashboard reuses the analytics calculators from `lib/analytics/` through `lib/analytics-engine.ts`; no calculation is duplicated. Verification uses `npx tsc --noEmit` plus `node scripts/build-cloud.cjs`; no mobile code changed, so the mobile version remains V35.

## 89. V39 Year-Agnostic Analytics

- Analytics stops hardcoding 2026: `lib/analytics/core.ts` adds `yearStartMs(now)` and `yearStartIso(now)` UTC calendar-year anchors, re-exported through `lib/analytics-engine.ts`. SLA KPIs (`sla-format.ts`), technician scorecards and YTD capacity (`technician.ts`, with a fixed rounding bug in YTD hours), bad-actor observation days, audit-findings and long-jobs monthly trends, and the SLA breach checkpoints (`buildCheckpoints` uses `now.getUTCFullYear()`) all derive the year from `now`, so the module keeps working in 2027 and beyond.
- `app/analytics/page.tsx` refreshes its `now` timestamp every 60 seconds, so long-lived sessions keep truthful YTD/overdue KPIs, and CSV exports stamp the filename with site and date (`analytics-<tab>-<siteId>-<DD-MM-YYYY>.csv`).
- SlaTab computes the monthly series once and reuses it for both trend and chart; TechniciansTab computes all four scorecard windows in one memo and reuses them for the leaderboard; window labels show the live year. Long Jobs and Audits tab titles use the live year too.
- The DrilldownDrawer closes on Escape; sortable table headers in Assets and Audits tabs carry `aria-pressed`. Verification uses `npx tsc --noEmit` in web-portal plus `node scripts/build-cloud.cjs`; no mobile code changed, so the mobile version remains V35.

## 90. V40 Bundled 02-ESOC S-Building Model

- The example S building for 02-ESOC (Darmstadt) ships as a bundled model: `apps/web-portal/public/bim/02-S_V1.ifc.gz` (25.6MB Revit Reference View export compressed to 5.7MB). Bundled storage is deliberate: Render has no persistent disk, so runtime `.data/bim` uploads would be lost on redeploy, while `public/bim` ships with every build. The gzip ISIZE footer equals the uncompressed size and is verified as in `app/api/bim-models/route.ts`.
- `GET /api/bim-models` lists `02-S_V1` for every site alongside S01-BL-1/S01-BL-2 through the existing bundled-model path; the in-app upload equipment-mark flow keeps working, and PATCH assignments still persist as site overrides via copy-on-write.
- The 3D BIM Viewer now prefers the site-matching model when picking a default: it selects the first catalogue entry whose buildingId starts with the site's `NN-` prefix (e.g. `02-S_V1` for 02-ESOC), falling back to the legacy S01-BL-1 default for sites without a matching model. `?building=` deep links keep overriding the choice.
- Verification uses `npx tsc --noEmit` in web-portal plus `node scripts/build-cloud.cjs`; no mobile code changed, so the mobile version remains V35.

## 91. V41 S Building Darmstadt Showcase

- The 02-S_V1 example building for 02-ESOC (Darmstadt) carries a pre-seeded CAFM showcase via `withSBuildingShowcase` in `lib/sb-building-seed.ts`, mirroring the Snowdon Towers pattern: building record, 8 IFC storeys as floors (Basement through Roof), and the 9 rooms occupied by the flagship assets, plus `bimElementLinks` for every record.
- 12 equipment records bind to the real Revit-placed 3D elements by IfcGlobalId/expressId harvested from `02-S_V1.ifc` (AHU 1/2, Carrier DX condensing unit, Fondital 100/24 water heaters, Grundfos DELTA HCU booster, Lovato Macro E5-SR PRO, ABB System pro E cabinet, copier, kitchen unit, Duravit DuraStyle toilet, Haws emergency tempering skid), each with manufacturer, model, category, trade, installation/warranty dates and BIM metadata (`bimGlobalId`, `bimExpressId`, `bimBuildingId`, `bimCategory`, `bimTypeName`), so all 12 elements light up as linked in the viewer without manual assignment.
- Live Maintenance Status demo variety: 2 overdue fast jobs (AHU 1 filter alarm, kitchen sink leak) show red, 5 open/on-hold FJs (DX service, burner inspection, thermographic board inspection, toilet valve, drench skid test) show amber, a location freeze on Basement pump room -109 shows the DELTA HCU cyan, and PM orders are generated for every showcase asset. The migration is idempotent, runs after `withSnowdonShowcase` on every scope pass and never overwrites existing records; codes are allocated from the first free 10-digit block at or above 21.
- Verification uses `npx tsc --noEmit` in web-portal plus `node scripts/build-cloud.cjs`; no mobile code changed, so the mobile version remains V35.

## 92. V42 Mission Control (Planner View over the Freeze Engine)

- New first-class section `Mission Control` (`/mission-control`, sidebar under Operations with a satellite icon) lets mission planners register mission operations windows in their own language: mission/programme name and reference, event type (LEOP, Launch Window, Critical Pass, Maneuver, Collision Avoidance, Commissioning, Special Event), criticality, ops window, protected zones (building/floor/room multi-select with parent-aware invariants), mission lead and ops remarks. They never see PM/FJ/LJ wiring.
- Planners pick a facility constraint in mission terms: Total lockdown (no facility interventions), Planned work only (quiet PM permitted, no interruptive work) or Coordinate first (work after agreeing timing with the duty FOM). The mapping lives in `lib/mission-control.ts` and is the only place translating between planner language and facility rules (lockdown: PM/FJ/LJ all frozen; planned only: PM allowed, FJ/LJ frozen; coordinate first: all allowed, freeze stays visible for awareness).
- Publishing an event creates or updates a `LocationFreeze` automatically with title `MISSION EVENT: <mission> <event type>` and the constraint's allow flags; the facility team keeps using Location Freezes, dispatch conflict detection, FreezeSafetyGate and PM banners unchanged. Unpublish removes only the linked freeze; status is derived (Published to CAFM / Draft / Facility freeze removed) so manually deleted freezes surface instead of lying. The editor shows a live "What the facility team will see" preview.
- Schema: `MissionEventSchema` in `packages/shared-schema/src/mission-control.ts` (id, siteId, missionRef, missionName, eventType, criticality, start/endDateTime, buildingIds + optional floorIds/roomIds, facilityConstraint, missionLead, remarks, optional freezeId; end-after-start and rooms-need-floors refinements). New granular permission `canManageMissionEvents` in shared schema, route validation, UserAccessMatrix ("Scheduling & Workforce") and presets (TeamLeader and FullAdmin granular via permissionsForPreset); `backfillPermissionKeys` adds the flag to saved roles only where absent, never overriding stored choices.
- Idempotent showcase `withMissionShowcase` in `lib/mission-seed.ts`, wired into the scope pass before `withSBuildingShowcase`: per site three demo events (published Critical LEOP total lockdown now, draft High critical pass next week, published Standard maneuver coordinate-first next month) with two linked freezes, all schema-validated, never overwriting existing records. State carries `missionEvents` (optional, validated by the cafm-state route and scoped per site in `scopeData`).
- Verification uses `npm run build` in `packages/shared-schema` then `npx tsc --noEmit` in shared-schema and web-portal, `node scripts/check-code-health.cjs` and `node scripts/build-cloud.cjs`; no mobile code changed, so the mobile version remains V35.

## 93. V43 Presentation Alert Mute

- The store banners (state sync errors, browser-storage-full warning, legacy backup notice, PM assignment migration notes) can be muted for presentations and demos. Muting is presentation-only: sync retries, error state and in-page action errors are unaffected.
- Each banner carries a "Hide alerts" link. Clicking it sets localStorage key `cafm_alerts_muted_v1` to "1", so the mute survives reloads and deploys. When muted, the sidebar footer shows a discreet gray "System alerts are hidden · Show" link as the single restore point.
- Exposed via the store context (`alertsMuted`, `setAlertsMuted`); the ScopedStoreProvider reads the flag on mount and writes it on every toggle.
- Scope note: banners are hidden, not resolved. The oversized-state HTTP 413 condition (site 02-ESOC after the full IFC room import) persists server-side and still needs the planned state-diet round (size readout in the banner, photo/blob offload, cap decision).
- Verification: `npm run build` in `packages/shared-schema`, `npm run typecheck` in `apps/web-portal`, `node scripts/check-code-health.cjs`, `node scripts/build-cloud.cjs`. No mobile code changed; the mobile version remains V35.
- V42 regression fix: `canManageMissionEvents` is declared `z.boolean().optional()` in the shared schema (Section 92 shipped it as required). The mobile app parses persisted site contexts through `UserAccessProfileSchema`, and every profile saved before V42 failed validation ("expected boolean, received undefined"), breaking the mobile app; optional restores old-data compatibility while admin roles still receive the flag through `backfillPermissionKeys`. `resolveEffectivePermissions` and the backfill were hardened for the optional type (`result[key] || !!role.permissions[key]`, explicit addition records).
- The alert-mute additions to `lib/cafm-store.tsx` are compacted to keep the file at 597 lines, inside the 600-line cap for files outside the legacy baseline.

## 94. V44 Database Split Stage A (Per-Site, Per-Collection Postgres Storage)

- The server stops storing the whole multi-site dataset in one giant JSON row (`cafm_state`, id=`default`, 32 MB cap root cause of the 02-ESOC HTTP 413). New layout in the existing Supabase Postgres: table `cafm_blocks` holds one row per site and per top-level state collection (`site_id`, `kind`, `payload` jsonb, primary key `(site_id, kind)`), and `cafm_site_revision` holds one row per site with its integer revision. Both enable RLS with no policies, so only the service-role key can touch them. Migration SQL ships as `scripts/supabase-v44-blocks.sql` (run once in the Supabase SQL editor; idempotent).
- Postgres function `cafm_save_state(p_site_id, p_expected_revision, p_new_revision, p_blocks)` replaces the blob PATCH as the sole write path: revision check under an advisory lock, block replacement and revision bump in one transaction. A stale or concurrent writer gets SQLSTATE 40001, which PostgREST surfaces as 409 so the route answers with the same reload-and-resolve conflict as before (no lost-update window between read and write), and `cafm_migrate_v44()` explodes the legacy blob into the new rows once, guarded by an advisory lock and block-existence check; the legacy table stays untouched as backup.
- `app/api/cafm-state/route.ts` swap only: `loadSupabaseDatabase` reads all revision and block rows and assembles the same multi-site Database object (validated through the unchanged `databaseSchema`), the save path calls the RPC, and the confusable-blob version-uuid check is gone because the revision check is now atomic inside Postgres. If the V44 SQL has not been run yet, the route fails fast with a clear message naming `scripts/supabase-v44-blocks.sql`.
- The HTTP API contract is byte-identical (GET envelope, POST whole-site with revision, 409 errors), so the web store and the mobile app need no change; mobile version stays V35. Disk/temporary backends are untouched.
- A GET response header `X-CAFM-State-Bytes` now reports the serialized size of the site state, giving the planned state-diet round a measurement without extra tooling.
- Verification: run `scripts/supabase-v44-blocks.sql` in the Supabase SQL editor, then `npm run build` in `packages/shared-schema` (unchanged, for safety), `npm run typecheck` in `apps/web-portal`, `node scripts/check-code-health.cjs`, `node scripts/build-cloud.cjs`. After deploy, confirm `X-CAFM-Storage: supabase` and a normal sync; the first load runs `cafm_migrate_v44` automatically.
- Stage B (next round, not in V44): the client tracks dirty collections and sends only those, eliminating the 32 MB request body for good; later Stage C adds per-record rows and row-level security.

## 95. V45 Collapsed PM Closure Acceptance + Technical Audits Checklist-Findings Filter

- Problem: closing a PM with an incomplete checklist (equipment broken, checklist honestly left blank, confirmed through the existing blank-checklist warning) at 50/55 -> 78% and then to 100% within one sync window arrives at the server collapsed as a single 50/55 -> 100 jump, which governance rejected with 403 "PM ... must be technically completed before closure". The client-side "Checklist incomplete · N" signal, the `ChecklistIncompleteOverride` record and the "with incomplete checklist override (N steps)" audit-log suffix already exist (78% step); only the server refused to reconcile the intermediate step.
- `lib/wr-governance.ts`: `hasCollapsedPmClosure(old, next)` proves the honest two-step sequence from the WR's own appended Activity log entries (kind "log", a "WR status changed from {50|55}% to 78%" entry followed later by a "WR status changed from 78% to 100%" entry). The closure rule now accepts 50/55 -> 100 with status "Closed" when that proof exists; direct jumps without logged intermediate steps are still rejected, and the `pmWorkRequests.complete` permission gate is unchanged. Applies to any collapsed legitimate close, not only checklist-override closes.
- Technical Audits (`app/technical-audits/page.tsx`): new "Checklist Findings" multi-select filter next to WR Types and Trades, applied to the inspector's request pool, queue and QR spot-check lists: "Checklist incomplete" (any required step unanswered), "Checklist fully filled" (PM with steps, none incomplete), "Unfavourable answers" (uses `getUnfavourableStepCount`) and "Follow-up FJ present" (uses `getFollowUpFJsForPM`); several picks combine with OR. Unset = no filtering, preserving the 5% quota selection logic.
- Verification: `npm run typecheck` in `apps/web-portal`, `node scripts/check-code-health.cjs`, `node scripts/build-cloud.cjs`. No mobile code changed; the mobile version remains V35.

## 96. V46 QA Audits on Closed PMs, Findings Chips, Visible-Count Indicators

- Problem 1: selecting a closed (100%) PM for QA audit wrote QA metadata, but governance's terminal rule rejected any change to a closed PM with 403 "PM ... is terminal and may only be reactivated by an administrator", so Technical Audits could never audit closed PMs. Per the V46 rule, closed (100%) PM/FJ WRs are the only auditable ones; 78% (technically completed) WRs are no longer selectable.
- `lib/qa-audits.ts`: `selectAudit` now requires `Percentage === 100` (message: "only closed (100%), unselected PM or FJ work requests can be selected"), `selectRandomAudits` builds both the eligible cohort and the pick pool from 100% WRs only, and `swapAudit` replacement candidates are 100% only.
- `lib/wr-governance.ts`: the terminal-PM rule (100/27) now accepts two V46 QA paths before demanding an administrator reactivation proof, both only for old.Percentage === 100: (1) `isPmQaMetadataChange`: every stage field (Percentage, WorkRequestStatus, WorkRequestSubstatus, ClosedAt, IsFrozen, FreezeReason) deep-equal and all remaining changed keys within a QA allowlist (QA_* fields, AuditInspectionStatus, qaStagedVerdict, qaReinspectionCount, qaTeamLeaderChallenges, FollowUpFJIds, Activity, UpdatedAt) via `keysEqualOutside`; (2) `isPmQaFailedReopen`: exactly the qaVerdict Fail reopen shape (Percentage 50, status "Issued", substatus "Re-opened (50% - QA Failed)", QA_AuditStatus "QA_Failed_ActionRequired", appended log "QA Inspection FAILED by ... WR automatically Re-opened and set to 50%."). All other changes to a closed/cancelled PM still require the admin reactivation proof; the 27% (cancelled) path is untouched.
- Technical Audits page (`app/technical-audits/page.tsx`): pool ("completed") and QR spot-check lists are 100%-only; new "Findings" column renders per-row chips from `lib/wr-signals.ts` helpers: amber "Checklist incomplete · N" (`getChecklistProgress`), rose "Unfavourable · N" (`getUnfavourableStepCount`), indigo "Follow-Up FJ ×N" (PM only, `getFollowUpFJsForPM`), em dash when clean; the chip text also feeds the column filter/sort. Styled action buttons: emerald primary "✚ Add selected to QA Audit (N)" and rose-outline "✕ Unselect / Remove Selected from Queue (N)".
- Visible-count indicators across overviews: `OverviewTable` (`components/common/TableColumns.tsx`) shows a light slate-400 "N shown (of M)" caption above the table, reflecting both client filters and its own column filters (covers Technical Audits, Equipment Registry, Mission Control, Location Freezes/Hierarchy, Craftperson Shift Workspace, Work Request Labor, QA Rework Monitor). `WorkRequestsFilterBar` (`components/modules/work-requests/WorkRequestsFilterBar.tsx`) shows the same light count from `filteredRequests`/`siteRequests` next to the Data Grid/Card View/Reset buttons on the PM, FJ, LJ and Work Requests queues.
- Verification: `npm run typecheck` in `apps/web-portal`, `node scripts/check-code-health.cjs`, `node scripts/build-cloud.cjs`. No mobile code changed; mobile version stays V35.

## 97. V47 Stage B Delta Sync (Client Sends Only Changed Collections)

- Problem: every POST /api/cafm-state carried the whole site state. Stage A (Section 94) moved storage into per-collection Supabase rows, but the wire still sent the full state on every push (1.28 MB for 02-ESOC, up to the 32 MB ceiling when a large room/BIM import ballooned the state). The client already tracked dirty WR IDs and changed top-level fields, yet push requests re-sent everything.
- New shared module `lib/sync-delta.ts` (pure, dependency-free): `buildSyncDelta(base, next)` diffs the acknowledged server state against the outgoing local state (changed/new WR records by WR_ID, deleted WR IDs, and every other changed top-level key sent whole: arrays, objects and scalars alike) and `applySyncDelta(base, delta)` merges that onto the stored state (deletions first, upserts by WR_ID keep stored order, untouched WR records keep their stored form). Server-side round-trip verified before shipping: a 1-edit session on a 225-WR state yields a 576-byte delta vs a 22 KB full state, and apply(build(base, next)) equals next on every top-level key, including the empty-delta no-op and deletion/addition reconciliation.
- Wire protocol, backward compatible: POST accepts either the legacy full-state envelope ({ revision, state, forceReset?, governanceProof? }) or the new delta envelope ({ revision, delta: { workRequests, deletedWrIds, collections }, governanceProof? }). A delta for a site with no stored state is 409 (one full upload first); forceReset keeps requiring a full state. Unchanged clients (mobile V35, PeopleDirectory and OnboardingQueue full-state writers) keep working untouched.
- `app/api/cafm-state/route.ts`: the backend load moved ahead of payload resolution; a delta is applied onto the stored site state and the merged state then runs through the exact same pipeline (strict stateSchema validation, feature-permission lock check, sanitizeStateForSite, site validation, revision check, duplicate/collision guards, mergeNewerWorkRequests, governance twice, cafm_save_state), so governance, conflict and multi-site semantics are unchanged. POST responses gained `X-CAFM-Upload-Bytes` (request payload size) for observability, next to GET's `X-CAFM-State-Bytes`.
- `lib/cafm-store.tsx`: the periodic push and `commitSnapshot` (imports, QA actions) now build their POST body with `buildSyncDelta(acknowledged server state, outgoing state)` instead of the full state, falling back to a full upload before the first acknowledgment or on forceReset. Diffing is based on the acknowledged snapshot (not only the dirty sets) so migrations and normalizations are captured too; the 409 path is unchanged because the client refresh-merges and rebuilds the delta against the new base on the next attempt.
- Code health: `useActiveUserPermissions` moved to new `lib/active-user-permissions.ts` and re-exported from cafm-store (none of its 37 callers change), keeping `lib/cafm-store.tsx` under the 600-line guardrail that `scripts/check-code-health.cjs` enforces on every cloud build; route.ts lands at 596 lines.
- Verification: `npm run typecheck` in apps/web-portal, `node scripts/check-code-health.cjs`, `node scripts/build-cloud.cjs`. After deploy: an empty-delta POST must return revision+1, a stale-revision delta 409, and browser devtools should show ordinary push bodies of a few KB instead of the full state size. No mobile code changed; mobile stays V35.

## 98. V48 Stage C Conditional GET (Idle Polls Stop Re-Downloading the State)

- Problem: Stage B (Section 97) shrank the upload side, but every client still downloaded the full site state on each 2.5 s poll and before each push (~1.36 MB raw, ~69 kB compressed, ~1.3 s per request observed live), regardless of whether anything changed.
- Wire protocol, backward compatible: GET accepts an optional `X-CAFM-Revision` header. When the offered revision equals the stored revision, the server replies with a tiny envelope `{ revision, state: null, unchanged: true }` plus `X-CAFM-Unchanged: 1` (observed: ~50 bytes before compression); any other GET, including every client without the header (mobile V35, OnboardingQueue, PeopleDirectory), is unchanged. `X-CAFM-Revision` was added to the CORS allowed headers.
- `lib/cafm-state-request.ts`: `stateRequest` gained an optional `knownRevision` parameter (sent as the header on GET) and returns `unchanged` alongside `revision`/`state`; response validation is otherwise identical.
- `lib/cafm-store.tsx`: the three sync GETs (reconnect, pre-push latest check, idle poll) offer `revision.current` when `knownRevision` is set; the first hydration GET stays full so a page load always lands a complete state. An `unchanged` answer short-circuits every existing path naturally: revision equality already made the client skip re-normalization and re-render, and the reconnect branch now preserves the previous acknowledgment instead of blanking it (which would have forced one extra full-state upload after a reconnect). The 409-conflict and merge paths are unchanged: a differing revision always returns the full state.
- `app/api/cafm-state/route.ts` (recorded in `scripts/check-code-health.cjs` LEGACY_BASELINES at 605 lines, growth limit 665): the GET handler loads storage, then answers the unchanged envelope when the offered revision matches; the full response (cross-site PMS/blueprint watermark injection, X-CAFM-State-Bytes) is untouched. The watermark injection is revision-consistent: injections from other sites' revisions are equally ignored by unchanged and full poll paths.
- Safety reasoning: unchanged is returned only when header revision = stored revision, and the client stores a revision only after receiving the matching full state, so a compressed tab can never be told "unchanged" about a state it never fetched; local unsynced edits are pushed as Stage B deltas regardless.
- Verification: `npm run typecheck` in apps/web-portal, `node scripts/check-code-health.cjs`, `node scripts/build-cloud.cjs`. After deploy: a GET with X-CAFM-Revision equal to the current revision must return X-CAFM-Unchanged: 1 with a ~50-byte body, a stale one the full state, and idle browser polls in devtools should shrink from ~69 kB to sub-kilobyte sizes. No mobile code changed; mobile stays V35.

## 99. V49 Database Stage C1 (Work Requests as Real Postgres Rows)

- Problem: V44 (Section 94) split the single blob into per-collection rows, but each collection, notably workRequests (277 heterogeneous records, ~100 distinct keys), still lived as one opaque jsonb payload. There was no classical one-row-per-record shape to browse, sort, filter or index in Postgres.
- `scripts/supabase-v49-wr-tables.sql` (production migration, pasted once into the Supabase SQL editor, idempotent, single transaction = atomic cutover): renames `cafm_blocks` to `cafm_blocks_store`; creates typed record tables `work_requests` and `deleted_work_requests` (60 columns: site_id, seq array order, primary key (site_id, wr_id), 56 extracted typed columns covering type/status/substatus/percentage, location, trade, dates, requestor, costs, SLA-adjacent, QA, PM, freeze and audit fields, plus `data` jsonb holding the complete record as the load-side source of truth; helper `cafm_wr_row()` is the single extraction definition; RLS on with no policies); moves existing blob payloads into rows (`jsonb_array_elements ... with ordinality` preserves array order); removes the two blob kinds; `cafm_v49_backup` snapshots the pre-migration state permanently as the emergency-rollback source (RLS-blocked).
- Compatibility: a `security_invoker` view named `cafm_blocks` (store rows plus `jsonb_agg` of record rows, driven by `cafm_site_revision` so every site always emits both WR keys, `[]` when a site has none) serves the identical `{site_id, kind, payload}` rows PostgREST always served. Zero application code changed: route.ts load, POST merge, `cafm_save_state` call shape, mobile V35, V47 delta sync and V48 conditional GET all keep working untouched.
- `cafm_save_state` replaced with the same signature and contract (advisory lock, expected-revision check, SQLSTATE 40001 conflict, full-site replacement, revision bump): writes the two WR kinds as record rows via `cafm_wr_store_rows` / `cafm_dwr_store_rows`, all other kinds to `cafm_blocks_store`. Duplicate WR_IDs within a site now fail the save loudly (primary-key violation) instead of being silently stored; upstream governance and sanitize layers prevent duplicates anyway.
- `cafm_migrate_v44` re-pointed at the store + record tables for fresh installs; the legacy blob path is unchanged.
- Offline verification on real production data (277 WRs, 1.37 MB state, run on a local PostgreSQL 16 with the live data seeded): the view reproduces the pre-migration state exactly (jsonb equality true, byte-identical sizes); exhaustive audit that every typed column of every row equals its record field: 0 mismatches; save roundtrips (identical re-save, edit + append + delete + collection touch, sparse minimal records) all correct; stale revision still raises 40001; the migration file ran three times with zero data change; a fresh site with empty workRequests emits `workRequests: []` / `deletedWorkRequests: []` from the view.
- Browser experience: the Supabase Table Editor now shows `work_requests` as a classical 277-row table with sortable columns, and the SQL editor can query typed columns directly without `jsonb_array_elements`. Emergency rollback notes are at the bottom of the migration file.
- Production hardening (20-11-2026 post-mortem): this project manages grants explicitly (no Supabase default privileges, V45-era posture), so the freshly created record tables lacked SELECT for service_role; because the cafm_blocks view is a security_invoker view, every API read failed instantly (permission denied, surfaced as the red HTTP 500 state-sync banner; writes were never affected). Fixed with `grant select on public.work_requests, public.deleted_work_requests to service_role;` after reproducing the exact failure and the fix in a local PostgREST replica; the grant is now baked into the migration file. Live verification after the fix: full GET 200 (1,405,007 bytes, revision 18, 277 WRs, 45 collections, X-CAFM-Storage: supabase) and conditional GET unchanged: 1. No data loss (revision stayed 18 throughout, meaning no save landed during the outage; edits made in that window must be re-done manually).
- Verification: no TS changed, so no typecheck/build dependency exists for the database change itself; run `scripts/supabase-v49-wr-tables.sql` in the Supabase SQL editor and eyeball its built-in verification (counts, `state_identical = t`, 25-row sample). `PLATFORM_VERSION` bumped to V49 for the sidebar (Section numbering: 99 = V49). No mobile code changed; mobile stays V35.

## 100. V50 Database Stage C2 (Equipment and Rooms as Real Postgres Rows)

- Problem: Stage C1 (Section 99) turned work requests into typed rows, but equipment (75 records, ~27 live keys, schema-defined optional fields beyond that) and rooms (46 records) still lived as one opaque jsonb payload row each in cafm_blocks_store; the Equipment Registry and Location Hierarchy had no classical browse/sort/filter shape and the only lookup indexes were none.
- `scripts/supabase-v50-eq-rooms-tables.sql` (production migration, pasted once into the Supabase SQL editor, idempotent, single transaction = atomic cutover, prerequisite: Section 99 applied): creates typed record tables `equipment` (43 columns: site_id, seq, PK (site_id, equipment_code), `data` jsonb complete record as the load-side source of truth, 39 extracted typed columns covering identity/name/category/hierarchy/status/criticality/manufacturer/model/serial/dimensions/weights/trade/parent/location/dates/dimensions/standards/specs/Activity log/Documents/BIM expressID+GlobalId/audit fields; 8 secondary indexes: site+seq, site+status, site+bl_id+room_code, site+trade, site+category, site+criticality, site+parent code for child drill-downs, site+bim_express_id for web-ifc element lookups) and `rooms` (16 columns: site_id, seq, PK (site_id, room_code), `data` jsonb, name/category/usage/department/cost center/net area/building/level/GeoJSON polygon/polygon source/desk-reservable/active flags; indexes site+seq, site+bl_id+level_name, site+is_active); RLS on with no policies; extraction defined once in `cafm_eq_row()` / `cafm_room_row()` (jsonb_typeof guards on object/array columns so sparse records can never crash a save); `cafm_eq_store_rows` / `cafm_room_store_rows` insert helpers; one-time data move with `with ordinality` order preservation, then the blob kinds are deleted; `cafm_v50_backup` snapshots the pre-migration equipment/rooms store rows permanently as the emergency-rollback source (RLS-blocked, 2 rows).
- Compatibility: the security_invoker view `cafm_blocks` is replaced with a five-part union (store rows + jsonb_agg of work_requests, deleted_work_requests, equipment, rooms, all record kinds driven by cafm_site_revision so every known site always emits them, `[]` when empty) serving the identical `{site_id, kind, payload}` rows; zero application code changed (route.ts, V47 delta sync, V48 conditional GET, mobile V35 all untouched, no typecheck dependency). `cafm_save_state` keeps its exact signature and contract and now writes four record kinds; duplicate EquipmentCodes/RoomCodes within one save fail loudly (PK violation, transaction rolled back), matching the V49 duplicate-WR semantics. `cafm_migrate_v44` re-pointed at the store + all four record tables for fresh installs. The explicit service_role grant block (Section 99's hard lesson) covers the two new tables from day one, so no repeat of the 20-11-2026 read outage: `grant select on public.equipment, public.rooms to service_role` runs inside the migration itself.
- Offline verification on real production data (revision 21, 307 WRs / 75 equipment / 46 rooms, local PostgreSQL 16.4 + real PostgREST 12.2.3 with Supabase-style roles authenticator/service_role and NO default privileges, the production grant posture): the view reproduces the pre-migration state byte-identically (sha-256 of all 45 kind payloads identical before, after, and after an identical re-save, 7 saves total including a full restore); exhaustive typed-column audit 0 mismatches on both tables (each stored row equals its own re-extraction); save roundtrips all correct (edit + append + delete on both record kinds in one save with a store-kind touch, sparse minimal records `{"EquipmentCode":"SPARSE-1"}`-style, empty `[]` collections, fresh-site edge emitting all 4 record kinds); stale revision still raises 40001; duplicate EquipmentCode save fails loudly with data unchanged; the file ran twice more after cutover with zero data change.
- PostgREST end-to-end before shipping this time: full state read through PostgREST as service_role returns all 45 kinds with equipment 75 / rooms 46 / workRequests 307 elements, and an RPC cafm_save_state call returns revision+1, replicating the production wire path exactly. The V49 incident scenario was deliberately reproduced first (revoking the equipment/rooms grants gives an instant 401 `permission denied for table equipment`, 17 ms), then the in-file grant block was confirmed to prevent it. Two replica-build lessons became durable: the store/revision tables keep their V44-era grants through the V49 rename (a hand-seeded replica without them fails on cafm_blocks_store), and Supabase's service_role is BYPASSRLS, which is what makes RLS-on-without-policies record tables readable by the server at all (a replica role without bypassrls returns empty payloads, not errors).
- Verification: no TS logic changed (only PLATFORM_VERSION), so `npm run typecheck` in apps/web-portal is a formality; run `scripts/supabase-v50-eq-rooms-tables.sql` in the Supabase SQL editor and eyeball its built-in verification (counts, `state_identical = t` vs cafm_v50_backup, kind census 45/45, 25-row samples of both tables), then `notify pgrst, 'reload schema';` as harmless insurance. `PLATFORM_VERSION` bumped to V50 for the sidebar (Section numbering: 100 = V50). No mobile code changed; mobile stays V35.

## 101. V51 Database Stage C3 (Buildings, Floors and Desks as Real Postgres Rows)

- Problem: Stage C2 (Section 100) moved equipment and rooms to typed rows, but the location trio still lived as opaque whole-collection jsonb rows in cafm_blocks_store: buildings (5 records), floors (31 records, NOT identifiable by FloorNumber alone, duplicate numbers per building; LevelName is the true identity, unique per building) and desks (0 live records, the CAD-extracted desk layer with no indexable geometry columns); the spatial hierarchy had no relational browse shape, so cross-entity paths like "room → floor → building" required scoped JSON parsing on every question.
- `scripts/supabase-v51-location-tables.sql` (production migration, pasted once into the Supabase SQL editor, idempotent, single transaction = atomic cutover, prerequisite: Sections 99+100 applied): creates typed record tables `buildings` (12 columns: site_id, seq, PK (site_id, bl_id), `data` jsonb complete record as the load-side source of truth, name/address/gps latitude/longitude/elevation meters/is_active/created_at/updated_at extracted; indexes site+seq, site+is_active), `floors` (10 columns: site_id, seq, PK (site_id, bl_id, level_name) since FloorNumber is a display/ordering value only, `data` jsonb, floor_number/gross area/floor plan url/format/is_active; indexes site+seq, site+bl_id) and `desks` (14 columns: site_id, seq, PK (site_id, desk_id) using the CAD extractor's id, `data` jsonb, name/deskType/building/level/room/centerX/centerY/widthM/heightM/isPermanent; indexes site+seq, site+room_code, site+bl_id); RLS on with no policies; extraction defined once in `cafm_building_row()` / `cafm_floor_row()` / `cafm_desk_row()` with the same jsonb_typeof guards convention for sparse records; `cafm_building_store_rows` / `cafm_floor_store_rows` / `cafm_desk_store_rows` insert helpers; one-time data move with `with ordinality` order preservation, then the blob kinds are deleted; `cafm_v51_backup` snapshots the pre-migration buildings/floors/desks store rows permanently as the emergency-rollback source (RLS-blocked, 3 rows).
- Compatibility: the security_invoker view `cafm_blocks` becomes an eight-part union (store rows + jsonb_agg of work_requests, deleted_work_requests, equipment, rooms, buildings, floors, desks, all seven record kinds driven by cafm_site_revision so every known site always emits them, `[]` when empty) still serving the identical `{site_id, kind, payload}` rows; zero application code changed (route.ts, V47 delta sync, V48 conditional GET, mobile V35 untouched). `cafm_save_state` keeps its exact signature and contract and now writes seven record kinds; duplicate bl_id or (bl_id, LevelName) pairs within one save fail loudly (PK violation, transaction rolled back). `cafm_migrate_v44` re-pointed at the store + all seven record tables for fresh installs. The explicit service_role grant block covers the three new tables from day one: `grant select on public.buildings, public.floors, public.desks to service_role` runs inside the migration itself, so no repeat of the 20-11-2026 read outage is possible.
- Offline verification on real production data (revision 24, local PostgreSQL 16.4 + real PostgREST 12.2.3 with Supabase-style roles authenticator/service_role BYPASSRLS and NO default privileges, fresh replica replaying V49 then V50 then V51): sha-256 of all 45 kind payloads identical before migration, after migration, after an identical re-save, and across 8 saves total including the mutation set (building rename, floor append, first-ever desk append proving the desk record shape, floor delete back to [], store-kind touch) and a full three-kind restore from cafm_v51_backup; exhaustive typed-column audit 0 mismatches on all three tables (each stored row equals its own re-extraction, composite equality); sparse minimal records survive saves with all optional columns NULL; empty desks emits `[]`; a fresh empty site emits all 7 record kind rows; stale revision raises 40001 (SQLSTATE confirmed by exception capture); duplicate bl_id and duplicate (bl_id, LevelName) saves fail loudly with all 45 kinds unchanged and revision untouched; idempotent: the whole file ran clean twice more after cutover. PostgREST wire-tested: full 45-kind read as service_role HTTP 200, RPC cafm_save_state round-trip over the wire byte-identical, and the V49 incident scenario reproduced exactly (revoke → instant 401 `permission denied for table buildings` in 12 ms → re-grant → 200), confirming the in-file grant block prevents it.
- Verification: no TS logic changed (only PLATFORM_VERSION), so `npm run typecheck` in apps/web-portal is a formality; run `scripts/supabase-v51-location-tables.sql` in the Supabase SQL editor and eyeball its built-in verification (counts buildings 5 / floors 31 / desks 0 / store 38 / backup 3, `state_identical = t` vs cafm_v51_backup, kind census 45/45, spatial hierarchy samples, and the rooms × floors × buildings relational join demo), then `notify pgrst, 'reload schema';` as harmless insurance. `PLATFORM_VERSION` bumped to V51 for the sidebar (Section numbering: 101 = V51). No mobile code changed; mobile stays V35.

## 102. V52 Locations Workbench (Tabbed Locations, Split-Screen Details, Location Editing)

- Problem: the /locations page (LocationHierarchyManager, V1-era demo scaffold) was a single stacked column: a cascading picker, three plain tables, a hard-coded "Room Details" box and decorative Edit/Delete/Add buttons wired to nothing; no location could actually be created, edited or deactivated anywhere in the portal, and the CAD picker duplicated navigation.
- Rebuilt as the Locations Workbench (no database change; buildings/floors/rooms rows from Stage C3 stand behind it):
  - `components/modules/locations/LocationsWorkbench.tsx`: Buildings | Floors | Rooms tabs with live counts; 50/50 split screen (stacks below lg), left the familiar OverviewTable (resizable/sortable/filterable columns, per-tab preference keys reused), right the details panel; selecting a row also syncs the app-wide cascading selection (useApp selectedBuilding/Floor/Room) so every other page follows the context; inactive rows render dimmed.
  - `components/modules/locations/LocationDetails.tsx`: rich read views: building panel (bl_id, name, address, GPS or "Not set", total gross area, created/updated stamps, stats tiles floors/rooms/equipment/open WRs, floor and room chips that jump to the other tabs), floor panel (parents, floor number, gross area, net area of its rooms, plan link or "None yet", rooms chips, embedded CadUpload for DXF extraction), room panel (breadcrumb chips, category/usage/department/cost center/net area/polygon source ("Extracted from CAD" for CAD plans)/desk-reservable, equipment list with codes, desks list, stats tiles); guarded actions per panel: Edit, Activate/Deactivate, Delete.
  - `components/modules/locations/LocationEditor.tsx`: modal editor for create+edit of all three kinds with client-side validation mirroring the schemas (Name/Address/RoomCode required, FloorNumber whole number incl. negatives like the S-building basement floors, areas non-negative, plan URL http(s), GPS ±90/±180, bl_id unique per site, LevelName unique per building, RoomCode unique per floor); identity fields (bl_id, LevelName, RoomCode) are disabled on edit with an inline explanation: equipment, desks, PM schedules and work requests reference them (renames stay create-new + deactivate-old to keep the server's referential checks green).
  - `lib/locations.ts`: pure helpers (building/floor/room stats with open-WR counts, GPS formatting, deletion blockers that mirror every referencing collection including both casing variants of PM schedule targets via pmTargetType, form validation, number coercion).
- Safety rules: Delete is only enabled when nothing references the location; the disabled button carries a "Why is delete disabled?" popover listing every blocker (floors/rooms/equipment/desks/PM schedules/WRs) and points at Deactivate instead; deletion requires a confirm dialog. Deactivation is the supported way to retire a location without breaking references. All writes go through the standard setData pipeline, so the V47 Stage B delta sync pushes only the changed collection and the V48 conditional GET keeps idle polls tiny. Editing is permission-gated on the existing `locations.write` RBAC permission (SuperAdmin + SiteAdministrator hold it); readers see the same details without action buttons.
- Replaced: `components/modules/LocationHierarchyManager.tsx` deleted (git history keeps it), `app/locations/page.tsx` now renders the workbench; LocationEquipmentPickerGroup and CadUpload are untouched and reused elsewhere.
- Verification: `npm run typecheck` in apps/web-portal, `node scripts/check-code-health.cjs` (new files well under the 600-line cap), `node scripts/build-cloud.cjs`; then: open /locations, switch tabs, click rows (details fill the right half, chips jump between tabs), edit a building's Name/Address/GPS, add a floor to it and a room on that floor, deactivate the room (list dims it), try Delete on a referenced location (popover explains, button disabled), then edit something unreferenced to confirm delete. Refresh: edits persist through the normal sync. `PLATFORM_VERSION` bumped to V52 (Section numbering: 102 = V52). No mobile code changed; mobile stays V35.

## 103. V53 Location Renames with Reference Cascade

- Problem: V52 shipped identity fields (bl_id, LevelName, RoomCode) locked on edit with "create a new location and deactivate the old one" as the rename story. That is unworkable for real operations: a misnamed floor or a recoded building cannot be fixed without recreating the hierarchy, and the human codes remain the working identity everywhere (reports, exports, mobile), so surrogate internal IDs were rejected (DB PK restructure + payload rewrites + forced mobile bump for no user-visible gain). Instead the rename itself became safe: renaming a location now rewrites every stored reference in one atomic save.
- New `lib/location-rename.ts` (pure module, no React): `formRenameRequest` detects a rename in an editor submit (edit mode + identity change, parents unchanged), `locationRenameImpact` counts affected records per collection, `applyLocationRename` performs the rewrites. Covered references (field spellings verified against the shared schemas): floors (bl_id), rooms (bl_id, LevelName), desks (bl_id, LevelName, RoomCode), equipment (bl_id, LevelName, RoomCode; `bimBuildingId` is a BIM model id, deliberately untouched), work requests + deleted work requests (bl_id, LevelName, RoomCode ONLY: no other field is touched so WR governance deep-equality of the rest holds), PM schedules + suppressed PM occurrences (bl_id, both LevelName/levelName and RoomCode/roomCode spellings preserved), location freezes (buildingId/buildingIds, floorId/floorIds, roomId/roomIds), mission events (buildingIds/floorIds/roomIds), equipment inspection sheets (buildingId + roomId so they keep matching their equipment), BIM element links (`buildingId:ifcGlobalId` keys rebuilt).
- Scoping rules: every match is site-scoped; freezes and mission events are only rewritten for their floor/room ids when the entry is scoped to exactly the renamed building (a shared "Level 0" across buildingIds arrays is ambiguous; multi-building entries keep their old ids, documented limitation, server only enforces the site scope on freezes anyway). Parent moves (floor to another building, room to another floor) are NOT renames and stay locked in the editor with their own note; create the location under the new parent instead.
- Governance (one server-side change): terminal PMs (100% closed, 27% cancelled) demand deep-equality or a full admin reactivation proof; `isPmLocationKeyChange` in `lib/wr-governance.ts` accepts a pure location-key rewrite on a terminal PM: stage/status/freeze fields must be deep-equal and every other field must be deep-equal except bl_id/LevelName/RoomCode/UpdatedAt/updatedAt (same key whitelisting pattern as the V46 QA metadata path; the two timestamp keys are the store's automatic `stampChangedWorkRequests` stamps - see the post-release fixes below). A rename cannot smuggle a stage or status change. The 78% labor/checklist lock and the LJ stage rules are unaffected (location keys are not in those field sets).
- UI: LocationEditor unlocks the identity input on edit with the rename note, parent selects keep their lock note, and a live amber impact preview shows the cascade counts ("Rename B1 → B2 ... 12 floors, 46 rooms, 75 equipment, 325 work requests") before saving; the workbench confirms the rename with a dialog summarizing the impact, applies the record change and the cascade inside a single setData, and re-selects the renamed identity (selection keys and the app-wide selectedBuilding/Floor/Room follow). Edit-mode uniqueness uses the same one-level rules as creation with the edited record excluded (overlapping rename to an existing code is blocked client-side; the server's PKs remain the backstop).
- Known limitation (accepted): a rename while another device holds pending offline edits can collide in the usual revision/delta way; a renamed floor with open offline work on the old key re-syncs from the server state. Multi-building freezes/mission events keep old level ids (above).
- Server validation is unchanged: `validateSite` re-proves every schedule against the renamed buildings/floors/rooms rows, architecture identical to V52 (full-collection replacement per kind at the V49-V51 typed-table layer makes PK changes plain row swaps, so no DB migration is needed).
- Verification: `npm run typecheck` in apps/web-portal, `node scripts/check-code-health.cjs` (location-rename.ts under the 600-line cap), `node scripts/build-cloud.cjs`; then on /locations: rename an unreferenced building (impact says no other records), rename a heavily referenced location (impact lists counts, confirm, everything follows: work requests, Equipment Registry, PM schedules open), verify a terminal PM WR keeps its history and the save is accepted, rename a floor with a PM schedule on it, rename a room with equipment, then rename something to an existing code (blocked with a clear error). Refresh: everything persists. `PLATFORM_VERSION` bumped to V53 (Section numbering: 103 = V53). No DB migration; no mobile code changed, mobile stays V35.
- Section 103 post-release fixes (V53.1, same section): (1) `pmTargetMap` in `lib/location-rename.ts` used an unguarded `else` so a building rename overwrote PM schedule `roomCode`/`RoomCode` with the empty string (server zod "too_small: roomCode" rejected the whole atomic save; no data ever lost); fixed to `else if (request.kind === "floor")`. (2) Live 403 "PM ... is terminal" on every code rename: the store's setData pipeline (`stampChangedWorkRequests` in `lib/state-merge.ts`) stamps `UpdatedAt`/`updatedAt` on every changed WR, and the cascade rewrite of a terminal PM therefore always differed from the server copy in two extra keys that the `isPmLocationKeyChange` whitelist did not allow, so every rename on a site holding closed/cancelled PMs was rejected atomically ("PM 2026000001 is terminal..."); the whitelist now also contains UpdatedAt/updatedAt, mirroring the V46 QA metadata whitelist which always allowed exactly these stamps. Name-only changes (no WR touched) never failed, which is what localized the bug. Durable lesson: any new governance whitelist must be tested against the store's automatic timestamp stamps, because every WR-touching edit arrives with them; a failing push wedges the browser's pending queue (atomic delta rejection blocks all later saves from that session until the local cache is cleared, e.g. DevTools localStorage.clear()).

## 104. V54 Stuck-Change Guard: Pause and Discard Unsavable Local Edits

- Problem: pushes are atomic deltas. When ONE record in the pending queue is unacceptable (a governance 403 such as a forbidden edit on a terminal PM, a schema rejection, an admin-only lock, or a deterministic merge conflict "changed elsewhere / require conflict resolution" where the local edit, the acknowledged baseline and the newer server copy disagree), the whole push is rejected, the client keeps the unsaved edit in localStorage and re-pushes every 2.5 s poll forever. Every LATER edit from that browser joins the same rejected delta, so the session silently goes fully read-only against the server, the banner returns after each page load, and the only manual remedy was a DevTools local-storage clear. This wedge hit three times during V53 testing (empty-roomCode bug cascade, terminal-PM timestamp-stamp rejections, and a stale local WR meeting the renames pushed by the same session).
- Failure classification (`lib/stuck-change.ts`, `permanentPushFailure`): StateRequestError with HTTP 400/401/403/422 (the server examined the payload and refused it, so retrying is pointless), or an Error whose message matches the deterministic state-merge conflict throws (`require conflict resolution`, `changed elsewhere`). Kept OUT of the classification: 409 revision races and 503 (already auto-retried through the reconnect path) and network/timeout failures, which are transient by design. The later one-off HTTP 500 (transient Supabase/Render blip, verified benign by a byte-identical full-state re-save returning 200) also stays in the retry loop, correctly so: it healed itself on the next poll.
- Store wiring (`lib/cafm-store.tsx`): when a push-phase failure is classified permanent, the catch sets `stuckRef`/`stuckChange` (a distinct orange banner) INSTEAD of the transient red `syncError`, and returns; the push block and the idle full-state GETs are gated behind `!stuckRef.current` so the loop stops hammering the server and stops re-downloading the (discarded) 1.6 MB state every poll. Only the discard action resumes normal syncing.
- UI (`components/common/StuckChangeAlert.tsx`): orange banner "Saving is paused: a local change cannot be saved to the server", explains that discarding removes only this device's unsaved edits (everything already saved stays on the server), and offers the "Discard local changes and reload server data" button. Honors the existing alerts-muted toggle like every other banner.
- Discard action: clears the dirty WR ids, dirty fields, unsaved-edit/pending-actor/offline flags and `editVersion`, removes the pending storage key, then forces a clean reload by resetting `revision` to 0 with an unknown revision, which makes the next GET return the FULL server state; the reconnect path (no user edits anymore) replaces the stale local world record by record instead of merging abandoned records back in. This is the supported in-app replacement for the DevTools `localStorage.clear()` workaround.
- Deliberately NOT done: auto-discarding after N failures (silently dropping a user's edit without consent) and auto-reverting only the offending record (would require the client to recompute which record the server's message refers to; the atomic rejection message names one WR but delta sends whole collections; deferred until a need is proven).
- Verification: `npm run typecheck` in apps/web-portal, `node scripts/check-code-health.cjs` (cafm-store.tsx recorded in LEGACY_BASELINES at 625 lines, growth limit 685; stuck-change.ts 16 lines; StuckChangeAlert.tsx 18 lines), `node scripts/build-cloud.cjs`; then: reproduce a permanent rejection (edit a closed PM's stage via an admin path without a proof, or paste a state edit that violates a governance whitelist) and confirm the orange pause banner appears once instead of the red banner returning every few seconds; click discard, confirm the banner disappears, the app reloads the server state, and a subsequent normal edit saves; also confirm a transient failure (kill the network briefly) still shows the ordinary red banner and self-heals.
- `PLATFORM_VERSION` bumped to V54 (Section numbering: 104 = V54). No DB migration; no server (route.ts) changes; no mobile code changed, mobile stays V35.
