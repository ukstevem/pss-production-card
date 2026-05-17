# 0004 — Kiosk runs as a web app on Pi + 7" touchscreen, not firmware on M5Stack

The kiosk is a fixed wall-mounted **Raspberry Pi 4 + 7" capacitive touchscreen**
with a **USB barcode scanner** and **USB RFID reader** (both present as
keyboards via HID profile). It runs **the same Next.js app** as the planner UI,
locked to a `/kiosk` route in browser kiosk mode (Chromium `--kiosk`). No
firmware, no PlatformIO toolchain. The `firmware/` directory referenced in
earlier scaffolds is dropped.

Rationale: the **Serial Picker** UX (touch grid of paint-serial buttons at
session-stop) needs a screen larger than the 320×240 M5Stack family offers,
and the everyday flow benefits from finger-friendly hit targets. Reusing the
existing Next.js codebase removes a major development track and unifies
deployment (same Docker pipeline). USB peripherals on Pi are well-supported —
both the scanner and the RFID reader feed keystrokes into focused inputs, so
the kiosk page handles them directly without driver work.

Auth contract is unchanged: LAN-only endpoint with HMAC-signed POSTs, secret
in `KIOSK_HMAC_SECRET`. Same `production_card_event` schema, same
`employee_cards` RFID lookup. The originator changes from firmware to web app;
the wire protocol does not.

Rejected: M5Stack family (screen too small for the Serial Picker; splits
development across firmware + web). Rejected: Android tablet (theft/damage
risk on shop floor; tablet-OS update overhead). Rejected: industrial
touch-panel PC (cost overkill for MVP).
