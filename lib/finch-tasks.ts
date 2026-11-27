export type FinchTask = {
  id: string;
  status: "completed" | "failed";
  text: string;
  completedAt: string;
  error?: string;
};

const tasks = new Map<string, FinchTask>();

export function saveTask(task: FinchTask): void {
  tasks.set(task.id, task);
  if (tasks.size > 100) {
    const oldest = tasks.keys().next().value;
    if (oldest) tasks.delete(oldest);
  }
}

export function readTask(id: string): FinchTask | undefined {
  return tasks.get(id);
}
