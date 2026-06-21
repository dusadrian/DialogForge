export const normalizeConsoleLineEndings = (value: unknown): string =>
  String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const looksLikeBareRepoHost = (value: string): boolean => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^[a-z]+:\/\//i.test(trimmed)) return false;
  if (!/[.]/.test(trimmed)) return false;
  if (/[\/\\\s]/.test(trimmed)) return false;
  if (!/^[A-Za-z0-9.-]+$/.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed);
};
const normalizeInstallPackagesRepos = (source: string): string => source.replace(
  /(install\.packages\s*\([\s\S]*?\brepos\s*=\s*)(['"])([^'"]+)\2/gi,
  (full, prefix, quote, repo) => {
    const trimmedRepo = String(repo || '').trim();
    if (!looksLikeBareRepoHost(trimmedRepo)) return full;
    return `${prefix}${quote}https://${trimmedRepo}${quote}`;
  }
);

export const normalizeConsoleCommandText = (value: unknown): string => {
  const source = normalizeConsoleLineEndings(value);
  return /install\.packages\s*\(/i.test(source)
    ? normalizeInstallPackagesRepos(source)
    : source;
};

export const isIgnorableConsoleCommandText = (value: unknown): boolean => {
  const source = normalizeConsoleCommandText(value);
  if (!source.trim()) return true;
  const lines = source.split('\n');
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    return false;
  }
  return true;
};
