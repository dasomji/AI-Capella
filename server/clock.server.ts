/** Application clock shared by invitation operations; injectable in process for tests. */
export const clock = { now: () => new Date() };
