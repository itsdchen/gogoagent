# Phone access

gogoagent's phone UI runs in Safari or Chrome. It does not require a native
mobile app. The computer running the sidecar remains the host: it owns the
agents, terminals, logs, and workstream state.

## Before you start

The host computer must:

- Be powered on and awake.
- Have the gogoagent sidecar running.
- Have **Phone access** enabled from the desktop app at least once during this
  sidecar run.

For access away from the computer's Wi-Fi network, Tailscale must be connected
on both the computer and phone using the same tailnet. Do not expose the
gogoagent HTTP port through router port forwarding.

## Connect the phone

1. Start or restart gogoagent with `./start.sh`.
2. Select **Connect phone** in the bottom-right corner.
3. Select **Start phone access**.
4. Choose a connection:
   - **Private VPN** for Tailscale, including access away from home.
   - **Local network** when both devices are on the same trusted Wi-Fi.
5. Open the phone's camera and scan the QR code.
6. Safari or Chrome opens the gogoagent page and pairs automatically.

If QR scanning is unavailable, open the displayed address on the phone and
enter the six-digit pairing code.

The QR link expires after ten minutes and rotates after it is used. A paired
browser session lasts for up to twelve hours. The pairing link and fallback
code should be treated as temporary credentials.

## Everyday phone workflow

From the phone UI you can:

- Review the **Needs you** inbox.
- Open workstreams and read recent terminal output.
- Review a waiting agent's prompt beside the saved workstream goal and next step.
- Read the agent's question in **Needs you** before opening the workstream.
- Tap numbered or yes/no choices from that prompt. If the prompt changes before delivery, the choice is rejected and you can review it again.
- Review the last choice sent, its send time, and whether new terminal output appeared. The receipt does not claim that the agent accepted the choice.

Choice receipts are shared by the running sidecar, so they appear on desktop and phone. They clear when that sidecar exits.
- Write in the bottom composer and tap **Send** to send a message to a running
  Claude or Codex terminal and press Enter.
- Review and edit a workstream's state capsule.
- Resume a discovered Claude or Codex session after reviewing its handoff and
  the current repository state. Choose an older session from the review sheet
  when needed.
- See which workstreams changed since you last opened them. The last-viewed
  marker and last selected terminal follow you between phone and desktop.

**Needs you** includes live agents waiting for input and saved blockers. Exited
agents appear in a collapsed **Exited agents** section below the workstreams,
where you can review their output. Within a workstream, waiting and running
terminals come before exited terminals.

Workstream cards use green **Active**, amber **Waiting**, and gray **Idle** badges
and edge accents. These reflect live terminal status; exited terminals do not
count as active.

The phone UI cannot start an arbitrary agent or shell, kill, close, or resize
terminals, or send input to shell terminals. **Continue** only resumes a native
Claude or Codex session already discovered in the selected workstream. If the
repository changes after review, open Continue again to inspect its new state.

Opening a workstream goes straight to a full-height agent workspace. Output
fills the space above the message composer, which stays visible when the
keyboard opens. Tap **Send** to submit the message to the named terminal.

- Tap the agent name to switch between agents across workstreams, or use
  **Next waiting →** to jump to another agent waiting for input.
- Tap **Context** to review or edit the workstream's state capsule.
- Tap **Continue** to review and resume a Claude or Codex session. The resumed
  terminal appears in the same workstream on phone and desktop.
- Tap **Aa** for text-size, line-wrapping, and output-block settings. Output
  defaults to 11 px and can shrink to 8 px; an existing saved size is preserved.
- Output-block dividers follow blank-line breaks and visible prompt markers,
  preserving the text and fenced code. These are visual separators, not verified
  user/assistant message boundaries. Turn off **Separate output blocks** for
  plain output.
- Scroll up to read earlier output without being pulled to the bottom as new
  output arrives. Tap **Latest ↓** to follow new output again.
- Use the back arrow or Android Back to close a panel, then return to workstreams.

Each terminal has its own draft and reading position. The phone browser stores
these locally and restores the open workspace after a page reload. These saved
drafts belong to this browser and gateway address; they are cleared when you
choose **Unpair this phone**. Draft text and scroll position stay on that phone;
the shared last-viewed marker and last selected terminal live on the sidecar.

Sending is disabled while a message is pending. If delivery cannot be confirmed,
your draft stays available; check terminal output before retrying. Quick choices
leave any separately composed message intact.

You may use the browser's **Add to Home Screen** command for app-like access.
This is still the same browser UI; the host computer and phone gateway must
remain available.

## Stop or revoke access

Select **Stop phone access** in the desktop dialog to stop the gateway and
invalidate every paired phone session. Closing the desktop window leaves the
gateway and paired phones connected while the sidecar runs. Stopping the
sidecar also stops the gateway. If the sidecar restarts, open the desktop and
start phone access again, then pair the phone again.

## Troubleshooting

If the QR page does not open:

1. Confirm phone access still says **on** in the desktop footer.
2. For Tailscale, confirm both devices show as connected to the same tailnet.
3. Return to **Connect phone**, choose **Private VPN**, and scan the current QR
   code again.
4. If using Wi-Fi instead, choose **Local network** and confirm both devices
   are on the same trusted network.
5. Stop and restart phone access to create a fresh gateway and pairing session.

If pairing succeeds but the UI reports that gogoagent is offline, check the
desktop's startup prerequisites with:

```bash
./start.sh --check
```

Then restart gogoagent and pair again.

## Resume this work later

When returning to phone development:

1. Run `./start.sh` and open **Connect phone**.
2. Test both **Local network** and **Private VPN** QR pairing.
3. From the phone, open a waiting workstream and submit a synthetic numbered
   choice.
4. Stop phone access and confirm the paired page can no longer refresh.
5. Run the verification commands:

```bash
corepack pnpm typecheck
corepack pnpm -r build
corepack pnpm test:mobile
corepack pnpm test:mobile-lifecycle
corepack pnpm test:clean-start
corepack pnpm test:launcher-port
git diff --check
```

The next useful product improvements are paired-device management and more
structured Claude/Codex prompt detection.
