/** Process-wide, non-queuing admission: hold through read, validation and persistence. */
export class UploadSlots {
  private users = new Map<string, number>();
  private active = 0;
  constructor(private globalMax: number, private userMax: number) {}
  take(user: string): { code: 429 | 503 } | { release: () => void } {
    const count = this.users.get(user) ?? 0;
    if (count >= this.userMax) return { code: 429 };
    if (this.active >= this.globalMax) return { code: 503 };
    this.active++; this.users.set(user, count + 1);
    let released = false;
    return { release: () => {
      if (released) return;
      released = true; this.active--;
      const remaining = this.users.get(user)! - 1;
      if (remaining) this.users.set(user, remaining); else this.users.delete(user);
    } };
  }
}
