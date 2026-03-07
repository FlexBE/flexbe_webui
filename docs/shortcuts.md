# Keyboard Shortcuts

This page documents the keyboard shortcuts and hotkeys currently wired into the FlexBE WebUI.

## Global Shortcuts

These shortcuts are available regardless of the active page unless noted otherwise.

| Shortcut | Action |
| --- | --- |
| `F1` | Switch to Dashboard |
| `F2` | Switch to State Machine Editor |
| `F3` | Switch to Runtime Control |
| `F4` | Switch to Settings |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+C` | Copy selected states/transitions |
| `Ctrl+X` | Cut selected states/transitions |
| `Ctrl+V` | Paste copied states/transitions |
| `Ctrl+T` | Toggle terminal panel |
| `Ctrl+Space` | Open the radial tool overlay on key down; evaluate the current tool selection on key up |
| `Esc` | Abort an in-progress transition and clear the current statemachine selection |
| `Del` | Remove the selected transition |

## Dashboard

These shortcuts are active on the Dashboard page.

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New behavior |
| `Ctrl+L` | Load behavior |
| `Ctrl+S` | Save behavior |
| `Ctrl+E` | Edit behavior code |
| `Ctrl+B` | View behavior code |
| `Ctrl+K` | Check behavior |

## State Machine Editor

These shortcuts are active on the State Machine page.

| Shortcut | Action |
| --- | --- |
| `Ctrl+1` | Add state |
| `Ctrl+2` | Add behavior |
| `Ctrl+3` | Add container |
| `Ctrl+D` | Toggle data flow graph |
| `Ctrl+H` | Toggle comments |
| `Ctrl+4` | Add comment |
| `Ctrl+F` | Toggle outcome fading |
| `Ctrl+A` | Auto-connect obvious outcomes |
| `Ctrl+G` | Group selected states |
| `Ctrl+S` | Save behavior |
| `Ctrl+K` | Check behavior |
| `Ctrl+Shift+Z` | Redo |

## State Machine View Navigation

These shortcuts are specific to the State Machine drawing area.

| Shortcut | Action |
| --- | --- |
| `Shift` | Temporarily enable panning mode and show the grid while held |
| `Shift+Space` | Pan back to the home position |
| `Shift+Home` | Pan back to the home position |
| `Shift+End` | Pan to the current canvas extents |
| `Shift+Left` | Pan left by one grid step |
| `Shift+Right` | Pan right by one grid step |
| `Shift+Up` | Pan up by one grid step |
| `Shift+Down` | Pan down by one grid step |

## Tool Overlay and Command Entry

The radial tool overlay and command entry use their own keyboard handling.

| Shortcut | Action |
| --- | --- |
| `Ctrl+Space` | Open the tool overlay |
| `Enter` | If a main page has focus, open command entry |
| `Enter` in command entry | Execute the current command |
| `Esc` in command entry | Close command entry |
| `Ctrl+Space` in command entry | Close command entry |
| `ArrowUp` in command entry | Browse older command history |
| `ArrowDown` in command entry | Browse newer command history |
| `ArrowRight` in command entry | Accept/extend autocomplete when the caret is at the end of the line |

## Runtime Control

The Runtime Control page has fewer direct Mousetrap bindings, but it still supports keyboard activation through focused controls:

| Shortcut | Action |
| --- | --- |
| `Enter` or `Space` on focused buttons | Activate the focused control |
| `Enter` or `Space` on focused checkboxes | Toggle the focused checkbox |

## Settings

The Settings page also relies mainly on focus-based keyboard interaction:

| Shortcut | Action |
| --- | --- |
| `Enter` on focused text/number fields | Apply the associated field handler |
| `Enter` or `Space` on focused checkboxes | Toggle the focused checkbox |

## Accessibility and Focus Navigation

These behaviors are shared across panels.

| Shortcut | Action |
| --- | --- |
| `Tab` | Move between focusable controls inside the active panel |
| `Enter` or `Space` on focused buttons | Trigger the button action |
| `Enter` on focused input fields with add/apply handlers | Trigger the associated add/apply action |
| `Shift+Enter` in the note editor | Save the note |

## Notes

- Many buttons and checkboxes are intentionally keyboard-accessible even when they do not have a dedicated global shortcut.
- Some shortcuts are page-specific and are ignored when the corresponding page is not active.
- The command-entry feature and the radial tool overlay are separate concepts:
  - `Ctrl+Space` controls the overlay.
  - `Enter` from a focused main page opens command entry.
