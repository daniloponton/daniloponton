import { z } from "zod";
import type { Project } from "./types";
import { PROJECT_SCHEMA_VERSION } from "./types";

/**
 * Exportação/importação de projeto em arquivo JSON — para backup, transporte
 * entre máquinas e compartilhamento. As entradas dos módulos são preservadas
 * (passthrough) e revalidadas pelos motores no momento do cálculo.
 */

const FORMAT = "elec-eng-project";

export function serializeProject(project: Project): string {
  return JSON.stringify({ format: FORMAT, schemaVersion: PROJECT_SCHEMA_VERSION, project }, null, 2);
}

const fileSchema = z.object({
  format: z.literal(FORMAT),
  schemaVersion: z.number(),
  project: z
    .object({
      id: z.string(),
      name: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      engineVersion: z.string(),
      circuits: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
    })
    .passthrough(),
});

/** Valida e desserializa o texto de um arquivo de projeto. Lança em caso inválido. */
export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Arquivo inválido: não é um JSON.");
  }
  const parsed = fileSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Arquivo não é um projeto válido desta ferramenta.");
  }
  if (parsed.data.schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Versão do arquivo (${parsed.data.schemaVersion}) é mais nova que a suportada (${PROJECT_SCHEMA_VERSION}). Atualize a ferramenta.`,
    );
  }
  return parsed.data.project as unknown as Project;
}
