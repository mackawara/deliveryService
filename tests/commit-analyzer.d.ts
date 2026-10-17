// The analyzer ships no types. Only the call the release-rule test makes.
declare module '@semantic-release/commit-analyzer' {
  export function analyzeCommits(
    pluginConfig: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<string | null>;
}
