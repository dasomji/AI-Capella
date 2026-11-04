import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { collections, encode, writeSnapshot } from "../../migration/snapshot";
export async function exportSnapshot(options: {
  project: string;
  credentials?: string;
  out?: string;
  productionAcknowledged?: boolean;
  checkPermissions?: boolean;
}) {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulator && !options.productionAcknowledged)
    throw Error(
      "Non-emulator export requires --i-understand-this-reads-production",
    );
  if (emulator && !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator))
    throw Error("Emulator must be loopback");
  if (emulator && !options.project.startsWith("demo-"))
    throw Error("Use a demo- project for emulator tests");
  if (!emulator && !options.credentials)
    throw Error("--credentials is required outside the emulator");
  const credentials = !emulator
    ? JSON.parse(await readFile(options.credentials!, "utf8"))
    : undefined;
  if (credentials && credentials.project_id !== options.project)
    throw Error("--project must equal service-account project_id");
  const app = initializeApp(
    {
      projectId: options.project,
      ...(credentials ? { credential: cert(credentials) } : {}),
    },
    "migration-" + Date.now(),
  );
  try {
    const db = getFirestore(app);
    const startedAt = new Date().toISOString();
    const roots = await db.listCollections();
    const unknownCollections = roots
      .map((c) => c.id)
      .filter((n) => !collections.includes(n))
      .sort();
    if (options.checkPermissions) {
      await db.runTransaction(
        async (tx) => {
          await tx.get(db.collection("ensembles").limit(1));
          await tx.get(db.doc("ensembles/migration-permission-probe"));
        },
        { readOnly: true },
      );
      // IAM introspection is read-only. Never probe with a write, even one expected to fail.
      let writePermissions: string[] | null = null;
      if (credentials) {
        const token = await app.options.credential!.getAccessToken();
        const response = await fetch(
          `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(options.project)}:testIamPermissions`,
          {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
              authorization: `Bearer ${token.access_token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              permissions: [
                "datastore.entities.create",
                "datastore.entities.update",
                "datastore.entities.delete",
              ],
            }),
          },
        );
        if (response.ok)
          writePermissions = ((await response.json()) as any).permissions ?? [];
      }
      if (writePermissions?.length)
        throw Error(
          "Credential holds write permissions: " + writePermissions.join(", "),
        );
      return {
        readAccess: true,
        writePermissions,
        iamVerified: false,
        operatorReviewRequired: true,
        emulator: !!emulator,
      };
    }
    if (!options.out) throw Error("--out required");
    // One read-only transaction pins repertoire and count queries to one snapshot.
    const result = await db.runTransaction(
      async (tx) => {
        const data: any = {},
          skippedCounts: Record<string, number> = {};
        let readTime: string | null = null;
        for (const name of collections) {
          if (["ensembles", "songs"].includes(name)) {
            const q = await tx.get(db.collection(name));
            data[name] = q.docs.map((d) => ({
              id: d.id,
              path: d.ref.path,
              data: encode(
                name === "ensembles"
                  ? Object.fromEntries(
                      Object.entries(d.data()).filter(
                        ([k]) => !["codeId", "leaderCodeId"].includes(k),
                      ),
                    )
                  : d.data(),
              ),
            }));
            readTime = q.readTime.toDate().toISOString();
          } else {
            const q = await tx.get(db.collection(name).count());
            skippedCounts[name] = q.data().count;
          }
        }
        // Nested anonymous memberships can exist without parent documents; retain counts only.
        const children = await tx.get(db.collectionGroup("ensembles").select());
        for (const name of ["members", "leaders"])
          skippedCounts[name] += children.docs.filter((d) =>
            d.ref.path.startsWith(name + "/"),
          ).length;
        return { data, readTime, skippedCounts };
      },
      { readOnly: true },
    );
    return await writeSnapshot(
      options.out,
      options.project,
      result.data,
      startedAt,
      result.readTime,
      { skippedCounts: result.skippedCounts, unknownCollections },
    );
  } finally {
    await deleteApp(app);
  }
}
if (process.argv[1]?.endsWith("/export.ts")) {
  const { values: v } = parseArgs({
    options: {
      project: { type: "string" },
      credentials: { type: "string" },
      out: { type: "string" },
      "check-permissions": { type: "boolean" },
      "i-understand-this-reads-production": { type: "boolean" },
    },
  });
  if (!v.project) throw Error("--project required");
  const result = await exportSnapshot({
    project: v.project,
    credentials: v.credentials,
    out: v.out,
    checkPermissions: v["check-permissions"],
    productionAcknowledged: v["i-understand-this-reads-production"],
  });
  if (v["check-permissions"]) console.log(JSON.stringify(result));
}
