# Paperless-ngx GUI Layout Analysis

This document records the visual interface layout of Paperless-ngx, analyzed directly from the screenshots in this research folder.

* * *

## 1. Main Document List GUI Layout (`search-results.png`)

### Top Header Bar (Green Theme)

* **Branding (Left):** "Paperless-ngx" logo next to a white leaf icon.
* **Search Box (Center):** Inline search bar for full-text queries.
* **User Action (Right):** User profile avatar and configuration dropdown.

### Left Navigation Sidebar (Collapsible)

* **Top Links:**
  * `Dashboard`
  * `Documents` (Default view)
* **Saved Views Section:** Shortcuts for pre-filtered views (e.g., `Inbox`, `Recently Added`).
* **Manage Section:** Resource lists including `Correspondents`, `Tags`, `Document Types`, `Storage Paths`, `Custom Fields`, `Templates`, and `Mail`.
* **Administration Section:** Core controls including `Settings`, `Users & Groups`, `File Tasks` (with red numeric indicators), and system `Logs`.
* **Footer:** External `Documentation` link and version tag (`Paperless-ngx v2.0.0`).

### Main Content Pane ("Documents")

* **Utility Toolbar (Top Right):** Dropdowns and icons for bulk select modes, list/grid/split toggles, sorting, and view management.
* **Interactive Filters Bar:** A search status input row (`Advanced search`) followed by pill-style dropdown badges for tag-based filtering (`Tags`, `Correspondent`, `Document type`, `Storage path`, `Created`, `Added`, `Permissions`), and a `Reset filters` button.
* **Document Grid/List Cards:**
  * **Visual Thumbnail (Left):** Rendered preview image of the first page of the document.
  * **Title & Tags (Center):** Filename with metadata tags (e.g. blue tag `TagWithPartial`, orange tag `Another Sample Tag`) and a highlighted text snippet matching the query.
  * **Bottom Actions:** Inline control buttons (`More like this`, `Edit`, `View`, `Download`).
  * **Attribute Details (Right):** Values representing correspondent labels, document types, and creation dates.

* * *

## 2. Document Detail Editor GUI Layout (`permissions-document.png`)

* **Left Navigation Sidebar:** Hidden/collapsed into an icon-only column to maximize working space.
* **Left-Center Editing Panel:**
  * **Global Controls (Top):** Browse arrows (`←`, `→`), a close button (`×`), and state buttons (`Discard`, `Save & next`, `Save`).
  * **Categorized Configuration Tabs:** `Details`, `Content`, `Metadata`, `Notes` (with numerical count badge), and `Permissions` (currently active tab).
  * **Tab Settings (Permissions):** Input select for `Owner`, multi-select tag arrays for `View` permissions (by user and group), and `Edit` permission rules.
* **Right Document Preview Panel (Split Frame):**
  * **Toolbar (Top):** Page navigation controls (`Page 1 of 4`) and utility action buttons (`Delete`, `Download`, `Actions`, `Custom Fields`, `Share Links`).
  * **Document Canvas:** Full-height rendering frame showing the processed document pages.

* * *

## 3. Epistemic Integrity & Search Boundary Disclosure

* **Searched Sources:** Local image files `search-results.png` and `permissions-document.png` located inside `.agents/feature-research/paperless-ngx/`.
* **Grounding Basis:** Direct pixel inspection using image loading tools.
* **Confidence:** High (layout details map 1-to-1 with the provided documentation media).
* **Gaps:** This layout represents the `v2.0.0` release UI scheme.
  Custom layouts, responsive layouts on narrow mobile browsers, and changes introduced in newer releases were not analyzed.
