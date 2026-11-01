# Threadspace

A Notion-style thread list for [BB](https://getbb.app). It replaces the sidebar thread list with projects, nested threads, project emoji and colours, and quiet status indicators.

[Русская версия](README.ru.md)

![Threadspace in the light theme](screenshots/light.jpg)

## Contents

- [Features](#features)
- [Status icons](#status-icons)
- [Hover sidebar mode](#hover-sidebar-mode)
- [Install](#install)
- [Development](#development)
- [Credits](#credits)
- [License](#license)

## Features

- **Projects as sections.** Each project has an emoji and an optional Notion background colour that fills its row. Icon and colour are chosen in one picker from the project's `···` menu.
- **Pinned threads inside their project.** Pinned threads lead their own project, with a pushpin and a divider, instead of a global favourites list. Pinning uses BB's native pin state.
- **Waiting for you.** Threads where an agent asked a question or needs approval are collected above the projects, with the project name and a count.
- **Quiet statuses.** One column on the right shows a synchronised spinner, a question bubble for input, a warning triangle for errors, or a dot for unread results. A collapsed project or parent thread shows a compact count of work and questions inside it, and nothing when it is idle.
- **Fast feedback.** The pressed thread highlights at once, before BB finishes switching threads.
- **Parent disclosure.** Hover a parent thread and the provider icon becomes a chevron in a small rounded box, like Notion nested pages.
- **Keyboard.** ↑/↓ move between rows, ←/→ fold and unfold, Enter opens.
- **Drag projects** to reorder them. The order is stored by the plugin and synced between windows.
- **Hover actions.** Pin, archive and the native thread menu appear on hover or keyboard focus. Archiving uses BB's own action, with confirmation and undo.
- **Themes and language.** Follows BB's light or dark theme and background; English and Russian follow the BB interface language.
- **Touch screens.** On phones and coarse pointers the list uses larger rows and always-visible controls.

## Status icons

Each thread shows at most one icon in the column on the right. When several states apply, the higher row in this table wins.

| Icon | Status | What it means | What to do |
|:---:|---|---|---|
| <img src="docs/status/waiting.svg" width="20" height="20" alt="waiting"> | Waiting for you | The agent asked a question or needs approval. The thread also appears in **Waiting for you** at the top. | Open the thread and answer. |
| <img src="docs/status/error.svg" width="20" height="20" alt="error"> | Error | The run failed, or a queued message could not be sent. | Open the thread for details. |
| <img src="docs/status/queued.svg" width="20" height="20" alt="queued"> | Queued | A message waits to start, the environment is being prepared, or the machine is unavailable. Hover for the reason. | Wait, or check the machine. |
| <img src="docs/status/working.svg" width="20" height="20" alt="working"> | Working | An agent is running, starting or stopping. All spinners turn in sync. | Nothing; it finishes on its own. |
| <img src="docs/status/unread.svg" width="20" height="20" alt="unread"> | Unread result | The agent finished and you have not opened the result yet. The title is bold. | Open the thread to read it. |
| <img src="docs/status/draft.svg" width="20" height="20" alt="draft"> | Draft | The composer holds a message you have not sent. | Send or clear it. |
| <img src="docs/status/pinned.svg" width="20" height="20" alt="pinned"> | Pinned | The thread is pinned to the top of its project. Shown only when no other status applies. | Unpin from the hover button. |

**Collapsed project or parent thread.** It shows a compact count instead of a single icon, for example `2` <img src="docs/status/working.svg" width="20" height="20" alt="working"> `/` `1` <img src="docs/status/waiting.svg" width="20" height="20" alt="waiting">: two threads working and one waiting for you inside. When nothing inside is working or waiting, nothing is shown.

Other plugins can add their own row glyphs; Threadspace keeps them as they are.

## Hover sidebar mode

Keep the sidebar hidden and slide it in when you need it.

- Turn it on in the Threadspace plugin settings, with the command **Threadspace: hide sidebar, show on hover** (default `⌘⇧S`, rebindable in Settings → Keyboard), or with `bb plugin config threadspace set sidebarHoverMode true`.
- Turning it on collapses BB's sidebar; turning it off expands it again.
- Move the pointer to the left edge of the window and the sidebar slides in over the content. It hides 250 ms after the pointer moves past it, and stays while a menu or popover is open.
- **Sidebar opening speed** sets the delay and slide: instant, fast (default), normal or slow.
- The setting is shared by every window. Mouse and pen only; touch screens keep the normal sidebar.

This mode is **experimental**: BB has no public API for the sidebar, so it relies on BB's current sidebar markup. If a BB update changes it, the mode stays off and shows a notice instead of breaking the window.

## Install

```sh
bb plugin install https://github.com/KosachMax/threadspace.git
bb settings ui set sidebar.threadListProvider threadspace/notion-sidebar
```

Switch back to the built-in list:

```sh
bb settings ui set sidebar.threadListProvider thread-list/thread-list
```

## Development

```sh
npm install --include=dev
npm test
npm run typecheck
npm run build
bb plugin install .
```

`screenshots/stand.html` renders the real panel components with demo data for screenshots.

## Credits

Russian emoji names come from [Unicode CLDR](https://cldr.unicode.org/); see `licenses/UNICODE-CLDR.txt`.

## License

MIT
