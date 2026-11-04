import type { PoolClient } from "pg";
import { validateScore } from "./score-validation.server";
export async function insertVersion(
  db: PoolClient,
  e: string,
  p: string,
  u: string | null,
  n: number,
  input: { format: "score" | "musicxml"; schemaVersion: 1 },
  data: Awaited<ReturnType<typeof validateScore>>,
) {
  const v = (
    await db.query(
      "insert into score_versions(ensemble_id,piece_id,version_no,created_by,format,schema_version,musicxml,native_score,content_hash,size,timing) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id",
      [
        e,
        p,
        n,
        u,
        input.format,
        input.schemaVersion,
        input.format === "musicxml" ? data.raw : null,
        input.format === "score" ? data.raw : null,
        data.hash,
        data.size,
        JSON.stringify(data.timing),
      ],
    )
  ).rows[0];
  await db.query(
    "update music_pieces set current_version_id=$1,format=$2 where id=$3",
    [v.id, input.format, p],
  );
}
