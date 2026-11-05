export function playerDisplayName(identity: {
  portfolioName?: string | null;
  accountName?: string | null;
  email?: string | null;
}): string | undefined {
  const saved = identity.portfolioName?.trim();
  const account = identity.accountName?.trim();
  const placeholder = (name: string) => /^(investor|player)$/i.test(name);
  // old starter names should not hide a real name already saved on the account.
  if (saved && account && placeholder(saved) && !placeholder(account)) return account;
  return saved || account || identity.email?.split('@')[0]?.trim() || undefined;
}

// the server accepts 2–40 characters, so a missing or very short name starts as investor.
export function startingPlayerName(name: string | null | undefined, email: string | null | undefined): string {
  const candidate = (name?.trim() || email?.split('@')[0] || '').slice(0, 40).trim();
  return candidate.length >= 2 ? candidate : 'Investor';
}
