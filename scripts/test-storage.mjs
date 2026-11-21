import { fileURLToPath } from "node:url";

// The image entrypoint otherwise enables preallocation and 1 GiB data files.
export function testStorageArgs() {
  return [
    "--mount",
    `type=bind,source=${fileURLToPath(new URL("./s3-local-master.toml", import.meta.url))},target=/etc/seaweedfs/master.toml,readonly`,
    "chrislusf/seaweedfs:4.06@sha256:a064c6923daf4451c943cec2f437a67523d7792ee589089bc4d4c27a61d78dea",
    "server", "-dir=/data", "-master.volumePreallocate=false",
    "-master.volumeSizeLimitMB=64", "-s3",
  ];
}
