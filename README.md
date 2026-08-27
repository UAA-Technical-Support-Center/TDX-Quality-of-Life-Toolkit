# TDX-Quality-of-Life-Toolkit
Browser userscript with multiple Quality of Life modifications for Team Dynamix (TDX)

Works on **any TDX instance** — domain is auto-detected, no editing required to run this at an institution other than the one it was built for. If you're on the University of Alaska TDX instance, see the companion **UA TDX QOL** script for UA-specific features (Service/Form warnings, IT User Lookup Tools) that don't apply elsewhere.

## Browser Requirements
You will need to be able to install and manage userscripts for your browser. To make that easy, you can use a userscript manager browser extension, such as [Tampermonkey](https://www.tampermonkey.net/index.php), [Greasemonkey](https://www.greasespot.net/), or [Violentmonkey](https://violentmonkey.github.io/).

For the purposes of this userscript [Tampermonkey](https://www.tampermonkey.net/index.php) is used in its development and will be referenced in documentation.

### Chrome - Developer mode
The recent update to Tampermonkey noted that it will soon be necessary to [enable developer mode](https://developer.chrome.com/docs/extensions/reference/api/userScripts#developer_mode_for_extension_users) to run userscripts in Chrome/Chromium browsers.

## Installing the script
1. Open the [TDX Quality of Life Toolkit.user.js](https://github.com/UAA-Technical-Support-Center/TDX-Quality-of-Life-Toolkit/blob/main/tdxQolToolkit.user.js) file.
2. Click the "[Copy raw file](https://github.blog/changelog/2021-09-20-quickly-copy-the-contents-of-a-file-to-the-clipboard/)" button
3. [Create a new Tampermonkey script](https://www.tampermonkey.net/faq.php#Q102).
4. Delete the default code in the new script.
5. Paste the copied code.
6. Save the script.

## How to Use

Once installed, the toolkit runs automatically in the background on relevant TDX pages. Each feature can be toggled individually via Tampermonkey's menu (see **Enabling/Disabling Features** below). Toggling a module requires a **page reload** to take effect — nothing is torn down live.

### On the Ticket Detail page (`.../Tickets/TicketDet...`)

**Service Portal View/Copy Buttons**
Adds two buttons next to Refresh in the toolbar: one opens the ticket's Service Portal view in a new tab, the other copies its Service Portal URL to your clipboard (with a brief checkmark confirmation). Requires your Client Portal Application ID to be set once via the menu command *"Set Portal App ID for Service Portal Links"* (this is the numeric ID in your Client Portal's URL, e.g. the "36" in `/TDClient/36/Portal/...`) — the buttons will prompt you for it if it isn't configured yet.

**Auto-Expand Feed**
Automatically clicks "More" at the bottom of the ticket feed until all entries are loaded — no manual clicking required, on either the All or Communications tab.

**Hide System Feed Entries**
Adds a "Show System" checkbox to the feed's filter row (next to Edits/Status Changes/Comments). Unchecking it hides feed entries authored by "System" (automated status changes, hold expirations, etc.) so you can focus on human activity. Checked (shown) by default each time you load the page.

**Ticket Keyboard Shortcuts**
Press these keys anywhere on the page *except* while typing in a field or the comment editor:

| Key | Action |
|---|---|
| `U` | Click Update |
| `C` | Click Comment |
| `M` | Click Merge Into |
| `T` | Click Take (Service Requests) |

Modifier keys (Ctrl/Alt/Cmd) are never intercepted, so normal browser shortcuts still work.

### On the Update Ticket page (`.../Tickets/Update...`)

**Templates Menu Keyboard Fix**
Adds full keyboard navigation to the Templates dropdown menu, which is otherwise mouse/hover-only: Arrow keys to move between items, Right/Left to open/close submenus, Home/End to jump to the first/last item, and Escape to close the menu and return focus to the toggle. Works for any app number — this fix is generic UI behavior, not tied to a specific TDX application.

**Off Hold Date Validator**
Watches the "Goes Off Hold" date field and Status dropdown as you edit them. TDX itself only shows the date field when the selected status requires one, so this works on any app number and any TDX instance's own status configuration — no per-instance setup needed. If the date is missing, invalid, or in the past, it blocks Save with a red warning. If the date is unusually far out, it shows an orange caution but still lets you save. Default threshold is 14 days — adjustable via the menu command *"Set Off Hold warning threshold (days)."*

---

## Enabling/Disabling Features

Every module can be turned on or off independently through Tampermonkey's menu — no code editing required.

1. Navigate to a page the toolkit runs on (any TDX ticket page).
2. Click the **Tampermonkey extension icon** in your browser toolbar.
3. Find **TDX Quality of Life Toolkit** in the list and expand it — its menu commands appear underneath.
4. Each module is listed with a checkbox indicator:
   - ✅ = currently enabled
   - ⬜ = currently disabled
5. Click a module's entry to flip it. A confirmation alert will remind you to **reload the page** for the change to take effect.

In addition to the per-module on/off toggles, a couple of modules have their own extra settings, also accessed via Tampermonkey's menu:

| Menu Command | Affects | What it does |
|---|---|---|
| *Set Portal App ID for Service Portal Links* | Service Portal View/Copy Buttons | Prompts for your instance's numeric Client Portal Application ID (required once before these buttons will work) |
| *Set Off Hold warning threshold (days)* | Off Hold Date Validator | Prompts for the number of days out that triggers the caution warning (default: 14) |

**Note:** since modules don't tear themselves down when disabled, always reload the page after changing any toggle or setting — otherwise the old behavior stays active until the next navigation.
