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
