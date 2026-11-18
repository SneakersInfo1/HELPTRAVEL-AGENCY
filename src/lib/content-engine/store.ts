import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import path from "node:path";

import { ContentDocumentSchema, type ContentDocument, type ContentType } from "./schema";

export interface FsLike {
  mkdir(target: string, options: { recursive: true }): Promise<void>;
  readdir(target: string): Promise<string[]>;
  readFile(target: string, encoding: "utf8"): Promise<string>;
  writeFile(target: string, data: string, options?: { flag?: "w" | "wx" }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(target: string, options: { force: true }): Promise<void>;
}

export const NODE_FS: FsLike = {
  mkdir: async (target, options) => {
    await nodeFs.mkdir(target, options);
  },
  readdir: async (target) => nodeFs.readdir(target),
  readFile: async (target, encoding) => nodeFs.readFile(target, encoding),
  writeFile: async (target, data, options) => {
    await nodeFs.writeFile(target, data, options);
  },
  rename: async (from, to) => nodeFs.rename(from, to),
  rm: async (target, options) => nodeFs.rm(target, options),
};

export class ContentStoreError extends Error {
  readonly name = "ContentStoreError";

  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

const FOLDER_BY_TYPE: Readonly<Record<ContentType, string>> = {
  article: "articles",
  comparison_enrichment: "comparisons",
  month_enrichment: "months",
  hub_enrichment: "hubs",
};

const DOCUMENT_FOLDERS = [...new Set(Object.values(FOLDER_BY_TYPE))].sort();

export function contentFolder(contentType: ContentType): string {
  return FOLDER_BY_TYPE[contentType];
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

async function readOptional(fs: FsLike, target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function removeQuietly(fs: FsLike, target: string): Promise<void> {
  try {
    await fs.rm(target, { force: true });
  } catch {
    // Sprzątanie nie może zasłonić pierwotnej przyczyny transakcji.
  }
}

export interface StoreWriteResult {
  files: string[];
}

interface WriteEntry {
  target: string;
  relative: string;
  temp: string;
  backup: string;
  previous: string | null;
  backupCreated: boolean;
  installed: boolean;
}

export interface ContentStoreOptions {
  root?: string;
  fs?: FsLike;
}

export class ContentStore {
  readonly root: string;
  readonly fs: FsLike;
  private rollbackSnapshot: Map<string, string | null> | null = null;

  constructor(options?: ContentStoreOptions | string, fs?: FsLike) {
    this.root = typeof options === "string" ? options : (options?.root ?? "content/seo");
    this.fs = fs ?? (typeof options === "object" ? options.fs : undefined) ?? NODE_FS;
  }

  async listDocuments(): Promise<ContentDocument[]> {
    const documents: Array<{ relative: string; document: ContentDocument }> = [];
    for (const folder of DOCUMENT_FOLDERS) {
      const directory = path.join(this.root, folder);
      let names: string[];
      try {
        names = await this.fs.readdir(directory);
      } catch (error) {
        if (isMissing(error)) continue;
        throw new ContentStoreError(`Nie można odczytać katalogu ${directory}`, error);
      }
      for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
        const relative = `${folder}/${name}`;
        const raw = await this.fs.readFile(path.join(directory, name), "utf8");
        let value: unknown;
        try {
          value = JSON.parse(raw) as unknown;
        } catch (error) {
          throw new ContentStoreError(`Nieprawidłowy JSON w ${relative}`, error);
        }
        const parsed = ContentDocumentSchema.safeParse(value);
        if (!parsed.success) throw new ContentStoreError(`Dokument ${relative} nie spełnia schematu: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
        documents.push({ relative, document: parsed.data });
      }
    }
    return documents.sort((left, right) => left.relative.localeCompare(right.relative)).map(({ document }) => document);
  }

  async readDocument(id: string): Promise<ContentDocument | null> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new ContentStoreError(`Nieprawidłowe id dokumentu: ${id}`);
    for (const folder of DOCUMENT_FOLDERS) {
      const target = path.join(this.root, folder, `${id}.json`);
      const raw = await readOptional(this.fs, target);
      if (raw === null) continue;
      const parsed = ContentDocumentSchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) throw new ContentStoreError(`Dokument ${folder}/${id}.json nie spełnia schematu`);
      return parsed.data;
    }
    return null;
  }

  async writeDocumentsAtomically(input: readonly ContentDocument[]): Promise<StoreWriteResult> {
    const documents = input.map((value) => ContentDocumentSchema.parse(value));
    const seen = new Set<string>();
    const transaction = randomUUID();
    const entries: WriteEntry[] = [];
    for (const document of documents) {
      if (seen.has(document.id)) throw new ContentStoreError(`Zdublowane id w transakcji: ${document.id}`);
      seen.add(document.id);
      const folder = contentFolder(document.contentType);
      const directory = path.join(this.root, folder);
      const relative = `${folder}/${document.id}.json`;
      await this.fs.mkdir(directory, { recursive: true });
      const target = path.join(directory, `${document.id}.json`);
      entries.push({
        target,
        relative,
        temp: path.join(directory, `.${document.id}.${transaction}.tmp`),
        backup: path.join(directory, `.${document.id}.${transaction}.bak`),
        previous: await readOptional(this.fs, target),
        backupCreated: false,
        installed: false,
      });
    }

    try {
      for (let index = 0; index < entries.length; index += 1) {
        await this.fs.writeFile(entries[index].temp, `${JSON.stringify(documents[index], null, 2)}\n`, { flag: "wx" });
      }
      for (const entry of entries) {
        if (entry.previous !== null) {
          await this.fs.rename(entry.target, entry.backup);
          entry.backupCreated = true;
        }
        await this.fs.rename(entry.temp, entry.target);
        entry.installed = true;
      }
      for (const entry of entries) {
        if (entry.backupCreated) await this.fs.rm(entry.backup, { force: true });
      }
    } catch (error) {
      await this.rollbackEntries(entries);
      throw new ContentStoreError("Atomowy zapis dokumentów nie powiódł się; przywrócono poprzedni stan", error);
    }

    this.rollbackSnapshot = new Map(entries.map((entry) => [entry.target, entry.previous]));
    return { files: entries.map((entry) => entry.relative).sort() };
  }

  async regenerateIndex(): Promise<string> {
    const documents = await this.listDocuments();
    const paths = documents
      .map((document) => `${contentFolder(document.contentType)}/${document.id}.json`)
      .sort((left, right) => left.localeCompare(right));
    const lines = ["// AUTO-GENERATED by scripts/content-engine/run.ts — nie edytuj ręcznie."];
    paths.forEach((relative, index) => lines.push(`import doc${index} from "./${relative}";`));
    lines.push(`export const CONTENT_DOCUMENTS: unknown[] = [${paths.map((_, index) => `doc${index}`).join(", ")}];`, "");
    await this.fs.mkdir(this.root, { recursive: true });
    const target = path.join(this.root, "index.generated.ts");
    const previous = await readOptional(this.fs, target);
    const token = randomUUID();
    const temp = path.join(this.root, `.index.generated.${token}.tmp`);
    const backup = path.join(this.root, `.index.generated.${token}.bak`);
    let backupCreated = false;
    let installed = false;
    try {
      await this.fs.writeFile(temp, lines.join("\n"), { flag: "wx" });
      if (previous !== null) {
        await this.fs.rename(target, backup);
        backupCreated = true;
      }
      await this.fs.rename(temp, target);
      installed = true;
      if (backupCreated) await this.fs.rm(backup, { force: true });
    } catch (error) {
      if (installed) await removeQuietly(this.fs, target);
      if (backupCreated) {
        try {
          await this.fs.rename(backup, target);
        } catch {
          if (previous !== null) await this.restoreFile(target, previous);
        }
      }
      await removeQuietly(this.fs, temp);
      await removeQuietly(this.fs, backup);
      throw new ContentStoreError("Nie udało się atomowo odtworzyć indeksu", error);
    }
    const snapshot = this.rollbackSnapshot ?? new Map<string, string | null>();
    snapshot.set(target, previous);
    this.rollbackSnapshot = snapshot;
    return "index.generated.ts";
  }

  /** Pipeline wywołuje rollback, jeżeli późniejszy krok publikacji (np. indeks) zawiedzie. */
  async rollbackLastWrite(): Promise<void> {
    if (!this.rollbackSnapshot) return;
    const snapshot = [...this.rollbackSnapshot.entries()].reverse();
    this.rollbackSnapshot = null;
    for (const [target, previous] of snapshot) {
      if (previous === null) await removeQuietly(this.fs, target);
      else await this.restoreFile(target, previous);
    }
  }

  commitLastWrite(): void {
    this.rollbackSnapshot = null;
  }

  async killSwitchExists(): Promise<boolean> {
    return (await readOptional(this.fs, path.join(this.root, "KILL_SWITCH"))) !== null;
  }

  private async rollbackEntries(entries: readonly WriteEntry[]): Promise<void> {
    for (const entry of [...entries].reverse()) {
      if (entry.installed) await removeQuietly(this.fs, entry.target);
      if (entry.backupCreated) {
        try {
          await this.fs.rename(entry.backup, entry.target);
        } catch {
          if (entry.previous !== null) await this.restoreFile(entry.target, entry.previous);
        }
      } else if (entry.previous !== null && entry.installed) {
        await this.restoreFile(entry.target, entry.previous);
      }
      await removeQuietly(this.fs, entry.temp);
      await removeQuietly(this.fs, entry.backup);
    }
  }

  private async restoreFile(target: string, content: string): Promise<void> {
    await this.fs.mkdir(path.dirname(target), { recursive: true });
    await this.fs.writeFile(target, content, { flag: "w" });
  }
}

