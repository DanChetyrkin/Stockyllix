export function playerDisplayName(identity: { portfolioName?: string | null; accountName?: string | null; email?: string | null }): string | undefined {
  const saved = identity.portfolioName?.trim();
  const account = identity.accountName?.trim();
  const placeholder = (name: string) => /^(investor|player)$/i.test(name);
  // old starter names should not hide a real name already saved on the account.
  if (saved && account && placeholder(saved) && !placeholder(account)) return account;
  return saved || account || identity.email?.split('@')[0]?.trim() || undefined;
}
