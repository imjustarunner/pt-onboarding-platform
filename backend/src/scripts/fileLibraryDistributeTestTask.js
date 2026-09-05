/**
 * One-off: file Testing Needed task for Library distribute modes.
 * Run: node src/scripts/fileLibraryDistributeTestTask.js
 */
import Task from '../models/Task.model.js';
import TaskLink from '../models/TaskLink.model.js';
import { inferTaskCategoryFromTitle, normalizeTaskCategories } from '../constants/taskCategories.js';

const title = 'Test: Library Distribute (View-Only, Collaborate, Give Personal Copy)';
const categories = normalizeTaskCategories(inferTaskCategoryFromTitle(title));

const task = await Task.create({
  taskType: 'custom',
  title,
  description: `What was happening: Library had no clear way to share view-only, collaborate on a master, or give each person a private editable copy.

Why it happened: Only folder email shares existed.

What was fixed: Resource Distribute modal with three modes. Give Personal Copy creates personal Library resources (source_resource_id) shown under Account → My Documents → Personal copies. View-Only / Collaborate grant library_permissions on the master.

Please test:
1. As admin, open an org Library file → ⋯ → Distribute… → Give Personal Copy → All Providers → confirm success.
2. As a provider recipient, open Account → My Documents → Personal copies and open your copy; confirm the Library master is unchanged.
3. Distribute the same master as Share View-Only to a coworker — they can open it but cannot edit (unless Collaborate).
4. Distribute as Collaborate — coworker with edit grant can update the shared master.
`,
  assignedByUserId: 501,
  taskListId: 10,
  projectId: 3,
  urgency: 'medium',
  isPrivate: false,
  categories
});

await TaskLink.create({
  taskId: task.id,
  url: 'https://plottwisthq.com/itsco/library',
  label: 'Library',
  createdByUserId: 501
});

console.log('Filed task', task.id);
process.exit(0);
