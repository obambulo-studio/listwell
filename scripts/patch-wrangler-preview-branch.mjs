import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PATCH_MARKER = "listwell-preview-branch-sanitize";

const root = path.join(import.meta.dirname, "..");
const cliPath = path.join(root, "node_modules/wrangler/wrangler-dist/cli.js");

const originalGetBranchName2 = `function getBranchName2() {
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

const patchedGetBranchName2 = `/* ${PATCH_MARKER} */
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
  }
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

const applyPatch = () => {
  let content = readFileSync(cliPath, "utf-8");
  if (content.includes(PATCH_MARKER)) {
    return;
  }
  if (!content.includes(originalGetBranchName2)) {
    console.warn(
      "wrangler preview branch patch: getBranchName2 shape changed; skip patch"
    );
    return;
  }
  content = content.replace(originalGetBranchName2, patchedGetBranchName2);
  writeFileSync(cliPath, content);
};

applyPatch();
