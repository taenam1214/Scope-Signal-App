"""Synthetic 'Westside Office Renovation' project — fully fictional.

Communications (emails/field reports), RFIs, and a change-order register that
intentionally contain: unrecorded potential changes, clearly recorded changes,
false positives, and an ambiguous case. LABELS encodes the ground truth and is
used ONLY by the evaluator, never passed to the extraction model.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SyntheticDoc:
    filename: str
    kind: str  # 'email' | 'rfi' | 'field_report' | 'register'
    text: str


# --- Communications (15) -----------------------------------------------------

DOCUMENTS: list[SyntheticDoc] = [
    # UNRECORDED potential changes (true positives: in docs, NOT in register) ---
    SyntheticDoc(
        "email-conduit-reroute.eml", "email",
        "From: pm@westgc.example\nTo: foreman@brightspark.example\nSubject: RFI-042 response - conduit\nDate: Mon, 10 Mar 2025 09:12:00 -0500\n\n"
        "Per RFI-042, the GC directed additional conduit routing to serve the revised equipment "
        "location on level 2. Please extend the conduit run accordingly and proceed this week.",
    ),
    SyntheticDoc(
        "field-report-panel-relocation.txt", "field_report",
        "Field report 2025-03-14. Owner directed relocation of panel board LP-3 to accommodate a "
        "layout change in the east corridor. We relocated LP-3 approximately 18 feet. No change "
        "order number was provided.",
    ),
    SyntheticDoc(
        "email-server-room-circuits.eml", "email",
        "From: owner.rep@westcorp.example\nTo: pm@brightspark.example\nSubject: Server room power\nDate: Tue, 18 Mar 2025 14:30:00 -0500\n\n"
        "We need additional dedicated circuits installed for the new server room equipment in "
        "suite 210. Please add the required branch circuits and panelboard capacity.",
    ),
    # RECORDED changes (true: referenced in docs AND present in register) --------
    SyntheticDoc(
        "email-co010-lighting.eml", "email",
        "From: pm@westgc.example\nTo: foreman@brightspark.example\nSubject: CO-010 lighting circuits\nDate: Fri, 21 Feb 2025 10:00:00 -0500\n\n"
        "This confirms CO-010 for the additional lighting circuits in the east wing. Proceed with "
        "the added circuits as shown on the revised lighting plan.",
    ),
    SyntheticDoc(
        "email-co012-feeder.txt", "email",
        "Subject: CO-012 feeder upgrade\n\nCO-012 covers the upgraded feeder to the main switchgear. "
        "Please proceed with the revised feeder sizing per the approved change.",
    ),
    SyntheticDoc(
        "email-co015-receptacles.txt", "email",
        "Subject: CO-015 break room receptacles\n\nCO-015 authorizes the additional receptacles in the "
        "break room. Install the added devices and circuits accordingly.",
    ),
    # FALSE POSITIVES (should NOT become new omissions) --------------------------
    SyntheticDoc(
        "email-inscope-conduit.eml", "email",
        "From: pm@westgc.example\nTo: foreman@brightspark.example\nSubject: Sheet E-101 conduit\nDate: Wed, 12 Mar 2025 08:00:00 -0500\n\n"
        "To confirm: the additional conduit shown on sheet E-101 is included in the original scope. "
        "No change order is required and there is no cost impact.",
    ),
    SyntheticDoc(
        "email-duplicate-lighting.txt", "email",
        "Subject: Reminder - east wing lighting\n\nReminder regarding CO-010: please proceed with the "
        "additional lighting circuits in the east wing as previously authorized.",
    ),
    SyntheticDoc(
        "email-clarification-panel.txt", "email",
        "Subject: Panel schedule clarification\n\nFor clarification only: the panel schedule remains as "
        "originally specified. This note does not affect scope and no change order is required.",
    ),
    # AMBIGUOUS (flag, no register match, needs review) --------------------------
    SyntheticDoc(
        "email-verbal-extra-pulls.eml", "email",
        "From: super@westgc.example\nTo: foreman@brightspark.example\nSubject: extra pulls\nDate: Thu, 20 Mar 2025 16:45:00 -0500\n\n"
        "As we discussed verbally on site, please proceed with the extra wire pulls for the second "
        "floor. I don't have a CO number yet; we'll sort the paperwork later.",
    ),
    # NEUTRAL filler (clearly no scope change) -----------------------------------
    SyntheticDoc(
        "email-schedule-update.txt", "email",
        "Subject: Weekly schedule\n\nThe project remains on schedule. Rough-in inspection is booked for "
        "next Tuesday. No action required.",
    ),
    SyntheticDoc(
        "email-safety-notice.txt", "email",
        "Subject: Safety reminder\n\nReminder to maintain clear egress paths and wear PPE in the "
        "electrical rooms. Thank you.",
    ),
    SyntheticDoc(
        "email-submittal-log.txt", "email",
        "Subject: Submittal log update\n\nThe switchgear submittal was returned 'approved as noted'. "
        "Please order per the approved submittal.",
    ),
    SyntheticDoc(
        "email-meeting-minutes.txt", "field_report",
        "Weekly coordination meeting minutes. Discussed sequencing with the mechanical trade. "
        "No scope changes were identified during the meeting.",
    ),
    SyntheticDoc(
        "email-delivery-confirmation.txt", "email",
        "Subject: Material delivery\n\nThe lighting fixtures for the east wing were delivered today and "
        "staged on level 1. No issues to report.",
    ),
]

# --- RFIs (5) ----------------------------------------------------------------

RFIS: list[SyntheticDoc] = [
    SyntheticDoc(
        "RFI-040.txt", "rfi",
        "RFI-040: Please confirm the mounting height for corridor fixtures. Response: Mount at 9'-0\" "
        "AFF per the architectural reflected ceiling plan. No scope change.",
    ),
    SyntheticDoc(
        "RFI-041.txt", "rfi",
        "RFI-041: Confirm the breaker rating for the existing panel HP-1. Response: Existing 20A "
        "breakers are acceptable as specified. No change.",
    ),
    SyntheticDoc(
        "RFI-042.txt", "rfi",
        "RFI-042: The equipment location on level 2 has moved. Response: Reroute the conduit to the "
        "revised equipment location; additional conduit will be required to reach the new position.",
    ),
    SyntheticDoc(
        "RFI-043.txt", "rfi",
        "RFI-043: Clarify the receptacle spacing in the open office. Response: 12' on center as shown; "
        "no change to the documented scope.",
    ),
    SyntheticDoc(
        "RFI-044.txt", "rfi",
        "RFI-044: Is the fire alarm interface by the electrical contractor? Response: Yes, as "
        "originally specified in the contract documents. No additional work.",
    ),
]

# --- Change-order register ---------------------------------------------------

REGISTER_HEADER = ["CO Number", "Description", "Date Submitted", "Status", "Amount"]
REGISTER_ROWS: list[list[str]] = [
    ["CO-010", "Additional lighting circuits - east wing", "2025-02-21", "Approved", "$4,800.00"],
    ["CO-012", "Upgraded feeder to main switchgear", "2025-02-28", "Approved", "$9,250.00"],
    ["CO-015", "Additional receptacles in break room", "2025-03-04", "Approved", "$1,450.00"],
    ["CO-008", "Parking lot light pole bases", "2025-02-10", "Approved", "$2,100.00"],
]


def register_csv() -> str:
    import csv
    import io

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(REGISTER_HEADER)
    w.writerows(REGISTER_ROWS)
    return buf.getvalue()


# --- Ground truth (evaluator only; never sent to the model) ------------------
#
# Each entry is identified by a token/keyword expected to appear in a finding's
# title/description/evidence.
LABELS = {
    # Expected unrecorded omissions (should be flagged, not matched in register).
    "expected_omissions": [
        {"id": "omission_conduit", "contains": ["conduit"], "ref": "RFI-042"},
        {"id": "omission_panel_relocation", "contains": ["relocat", "lp-3", "panel"]},
        {"id": "omission_server_room", "contains": ["server room", "dedicated circuit"]},
    ],
    # Recorded changes that SHOULD reconcile as matched/possible against register.
    "expected_recorded": [
        {"id": "co010", "ref": "CO-010"},
        {"id": "co012", "ref": "CO-012"},
        {"id": "co015", "ref": "CO-015"},
    ],
    # False positives: these keywords should NOT appear as *new unmatched* findings.
    "false_positives": [
        {"id": "inscope_conduit", "contains": ["e-101", "original scope"]},
        {"id": "clarification_panel", "contains": ["clarification"]},
    ],
    # Ambiguous: should be flagged with no register match.
    "ambiguous": [
        {"id": "verbal_extra_pulls", "contains": ["extra", "pull"]},
    ],
}


def all_documents() -> list[SyntheticDoc]:
    return DOCUMENTS + RFIS
