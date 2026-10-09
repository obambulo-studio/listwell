import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PATCH_MARKER = "listwell-preview-branch-sanitize";

const root = path.join(import.meta.dirname, "..");
const cliPath = path.join(root, "node_modules/wrangler/wrangler-dist/cli.js");

const originalGetBranchName2Wrangler4149 = `function getBranchName2() {
  const workersCIBranch = getWorkersCIBranchName();
  if (workersCIBranch) {
    return workersCIBranch;
  }
  const githubBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (githubBranch) {
    return githubBranch;
  }
  const gitlabBranch = process.env.CI_COMMIT_REF_NAME;
  if (gitlabBranch) {
    return gitlabBranch;
  }
  return resolveGitBranchName();
}`;

const originalGetBranchName2Wrangler4146 = `function getBranchName2() {
  const workersCIBranch = getWorkersCIBranchName();
  if (workersCIBranch) {
    return workersCIBranch;
  }
  const githubBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (githubBranch) {
    return githubBranch;
  }
  const gitlabBranch = process.env.CI_COMMIT_REF_NAME;
  if (gitlabBranch) {
    return gitlabBranch;
  }
  try {
    childProcess.execSync(\`git rev-parse --is-inside-work-tree\`, { stdio: "ignore" });
    return childProcess.execSync(\`git rev-parse --abbrev-ref HEAD\`).toString().trim();
  } catch {
    return void 0;
  }
}`;

const patchedGetBranchName2Header = `/* ${PATCH_MARKER} */
function listwellSanitizePreviewBranchName(branchName) {
  const cleaned = branchName
    .replaceAll(/[^a-zA-Z0-9-]/gu, "-")
    .replaceAll(/-+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .toLowerCase();
  return cleaned.length > 0 ? cleaned.slice(0, 63) : "preview";
}
function getBranchName2() {
  const workersCIBranch = getWorkersCIBranchName();
  if (workersCIBranch) {
    return listwellSanitizePreviewBranchName(workersCIBranch);
  }
  const githubBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (githubBranch) {
    return listwellSanitizePreviewBranchName(githubBranch);
  }
  const gitlabBranch = process.env.CI_COMMIT_REF_NAME;
  if (gitlabBranch) {
    return listwellSanitizePreviewBranchName(gitlabBranch);
  }`;

const patchedGetBranchName2Wrangler4149 = `${patchedGetBranchName2Header}
  const gitBranch = resolveGitBranchName();
  if (gitBranch) {
    return listwellSanitizePreviewBranchName(gitBranch);
  }
  return gitBranch;
}`;

const patchedGetBranchName2Wrangler4146 = `${patchedGetBranchName2Header}
  try {
    childProcess.execSync(\`git rev-parse --is-inside-work-tree\`, { stdio: "ignore" });
    const gitBranch = childProcess.execSync(\`git rev-parse --abbrev-ref HEAD\`).toString().trim();
    if (gitBranch && gitBranch !== "HEAD") {
      return listwellSanitizePreviewBranchName(gitBranch);
    }
    return gitBranch;
  } catch {
    return void 0;
  }
}`;

export const applyWranglerPreviewBranchPatch = () => {
  let content = readFileSync(cliPath, "utf-8");
  if (content.includes(PATCH_MARKER)) {
    return false;
  }
  let originalGetBranchName2 = null;
  let patchedGetBranchName2 = null;
  if (content.includes(originalGetBranchName2Wrangler4149)) {
    originalGetBranchName2 = originalGetBranchName2Wrangler4149;
    patchedGetBranchName2 = patchedGetBranchName2Wrangler4149;
  } else if (content.includes(originalGetBranchName2Wrangler4146)) {
    originalGetBranchName2 = originalGetBranchName2Wrangler4146;
    patchedGetBranchName2 = patchedGetBranchName2Wrangler4146;
  }
  if (originalGetBranchName2 === null || patchedGetBranchName2 === null) {
    console.warn(
      "wrangler preview branch patch: getBranchName2 shape changed; skip patch"
    );
    return false;
  }
  content = content.replace(originalGetBranchName2, patchedGetBranchName2);
  writeFileSync(cliPath, content);
  return true;
};

const executedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === executedPath) {
  applyWranglerPreviewBranchPatch();
}
