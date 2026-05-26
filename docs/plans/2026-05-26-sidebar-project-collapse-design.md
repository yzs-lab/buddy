# Sidebar Project Collapse Design

## Goal

Allow clicking a project row in the chat sidebar to collapse or expand that project's task list.

## Behavior

- Project rows act as disclosure controls.
- Each project can be expanded or collapsed independently.
- Collapsed state persists in `localStorage`, matching existing sidebar preferences such as pinned tasks and project names.
- The currently selected task's project remains expanded so the selected conversation does not disappear after reloads or task updates.
- Existing project row actions keep their behavior:
  - More actions opens the project menu.
  - New task creates a task in that project.
  - These buttons do not toggle the project.

## UI

- Add a chevron indicator before the folder icon.
- Use `ChevronDown` when expanded and `ChevronRight` when collapsed.
- Keep spacing, hover treatment, selected project styling, and task row styling consistent with the current sidebar.

## Data Flow

- `ChatSidebar` owns a `collapsedProjectKeys` state array.
- The key is the displayed project key used by the current grouping logic.
- Toggling a project updates state and writes `buddy.collapsedProjectKeys` to `localStorage`.
- Rendering hides task rows when the project is collapsed.

## Testing

- Add renderer tests for:
  - Project rows render as disclosure controls.
  - Clicking a project hides and shows its tasks.
  - Clicking the project action buttons does not toggle the project.
