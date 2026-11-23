/** sharp/src/common.cc has no error code for this guard; match its exact error. */
export function renderFailureExit(error) {
  return error.code === 'ENOENT' ? 70 : error.message === 'Input image exceeds pixel limit' ? 66 : 65;
}
