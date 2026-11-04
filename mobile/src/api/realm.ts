let owner: string | null = null;
let testing = false;

// the server separately checks administrator access to the isolated test world.
export function setTestRealm(uid: string | null, enabled: boolean) {
  owner = uid;
  testing = enabled;
}

export function usesTestRealm(uid: string) {
  return owner === uid && testing;
}
