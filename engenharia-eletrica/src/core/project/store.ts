import type { Project, ProjectMeta } from "./types";

/** Contrato de armazenamento de projetos (independe do backend). */
export interface ProjectStore {
  list(): Promise<ProjectMeta[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
}

function toMeta(p: Project): ProjectMeta {
  const { id, name, createdAt, updatedAt, engineVersion } = p;
  return { id, name, createdAt, updatedAt, engineVersion };
}

/** Armazenamento em memória — usado em testes e ambientes sem IndexedDB. */
export class MemoryProjectStore implements ProjectStore {
  private readonly map = new Map<string, Project>();

  async list(): Promise<ProjectMeta[]> {
    return [...this.map.values()]
      .map(toMeta)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string): Promise<Project | null> {
    const p = this.map.get(id);
    return p ? structuredClone(p) : null;
  }
  async save(project: Project): Promise<void> {
    this.map.set(project.id, structuredClone({ ...project, updatedAt: new Date().toISOString() }));
  }
  async remove(id: string): Promise<void> {
    this.map.delete(id);
  }
}

const DB_NAME = "elec-eng";
const STORE = "projects";

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Armazenamento em IndexedDB — persistência local no navegador, offline. */
export class IndexedDbProjectStore implements ProjectStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async list(): Promise<ProjectMeta[]> {
    const store = await this.tx("readonly");
    const all = await promisify(store.getAll() as IDBRequest<Project[]>);
    return all
      .map(toMeta)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string): Promise<Project | null> {
    const store = await this.tx("readonly");
    const p = await promisify(store.get(id) as IDBRequest<Project | undefined>);
    return p ?? null;
  }
  async save(project: Project): Promise<void> {
    const store = await this.tx("readwrite");
    await promisify(store.put({ ...project, updatedAt: new Date().toISOString() }));
  }
  async remove(id: string): Promise<void> {
    const store = await this.tx("readwrite");
    await promisify(store.delete(id));
  }
}

/** Devolve o backend adequado ao ambiente (IndexedDB no navegador). */
export function createDefaultStore(): ProjectStore {
  if (typeof indexedDB !== "undefined") return new IndexedDbProjectStore();
  return new MemoryProjectStore();
}
