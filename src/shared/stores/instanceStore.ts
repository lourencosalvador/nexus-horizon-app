export type InstanceStatus = "running" | "paused";

export type WorkspaceInstance = {
  id: string;
  name: string;
  url: string;
  status: InstanceStatus;
  createdAt: number;
  testMode: boolean;
};

const KEY = "nexus_demo_instances_v1";
const ACTIVE_KEY = "nexus_demo_active_instance_v1";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getStoredInstances(): WorkspaceInstance[] {
  if (typeof window === "undefined") return [];
  const raw = safeParse<WorkspaceInstance[]>(window.localStorage.getItem(KEY));
  return Array.isArray(raw) ? raw : [];
}

export function setStoredInstances(instances: WorkspaceInstance[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(instances));
}

export function hasInstances(): boolean {
  return getStoredInstances().length > 0;
}

export function getActiveInstanceId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_KEY);
  return raw && raw.length > 0 ? raw : null;
}

export function setActiveInstanceId(instanceId: string | null) {
  if (typeof window === "undefined") return;
  if (!instanceId) {
    window.localStorage.removeItem(ACTIVE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_KEY, instanceId);
}

export function getActiveInstance(): WorkspaceInstance | null {
  const instances = getStoredInstances();
  if (instances.length === 0) return null;
  const activeId = getActiveInstanceId();
  if (!activeId) return instances[0] ?? null;
  return instances.find((i) => i.id === activeId) ?? instances[0] ?? null;
}

