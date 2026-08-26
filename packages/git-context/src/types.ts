import type { GitContext as ProtocolGitContext } from "@contextparcel/protocol";

export type GitContext = ProtocolGitContext;
export type GitChangedFile = ProtocolGitContext["changed_files"][number];
export type GitCommit = ProtocolGitContext["recent_commits"][number];
