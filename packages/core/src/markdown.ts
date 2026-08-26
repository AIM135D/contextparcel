import type { HandoffPacket } from "@contextparcel/protocol";

function list(items: readonly string[], empty: string): string {
  return items.length === 0 ? empty : items.map((item) => `- ${item}`).join("\n");
}

export function generateHandoffMarkdown(packet: HandoffPacket): string {
  const lastUserMessage = [...packet.conversation.messages]
    .reverse()
    .find((message) => message.role === "user");
  const mission =
    packet.task.goal ?? lastUserMessage?.text ?? "Review the conversation context below.";
  const conversation = packet.conversation.messages
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "Assistant";
      return `## ${index + 1}. ${role}\n\n${message.text}`;
    })
    .join("\n\n");

  const repositoryState =
    packet.git === null
      ? "Git context was not included or this directory is not a Git repository."
      : [
          `- Branch: ${packet.git.branch ?? "detached HEAD"}`,
          `- HEAD: ${packet.git.commit ?? "unavailable"}`,
          `- Dirty: ${packet.git.dirty ? "yes" : "no"}`,
          `- Diff stat: ${packet.git.diff_stat ?? "clean or unavailable"}`
        ].join("\n");

  const changedFiles =
    packet.git === null
      ? "No Git context."
      : list(
          packet.git.changed_files.map((file) => `\`${file.status}\` \`${file.path}\``),
          "No changed files."
        );

  const recentCommits =
    packet.git === null
      ? "No Git context."
      : list(
          packet.git.recent_commits.map(
            (commit) => `\`${commit.hash.slice(0, 12)}\` ${commit.subject} (${commit.committed_at})`
          ),
          "No recent commits."
        );

  return `# Mission

${mission}

# Conversation Context

Source: ${packet.source.title} (${packet.source.type})  
Selection: ${packet.conversation.selection_mode}  
Messages: ${packet.conversation.messages.length}

${conversation}

# Decisions / Constraints

## Constraints

${list(packet.task.constraints, "No explicit constraints were extracted. Review the conversation.")}

## Acceptance Criteria

${list(packet.task.acceptance, "No explicit acceptance criteria were extracted. Review the conversation.")}

# Repository State

Project: ${packet.project.name}  
Root: \`${packet.project.root}\`

${repositoryState}

# Changed Files

${changedFiles}

# Recent Commits

${recentCommits}

# Pickup Instructions

Read this handoff and inspect the repository before making changes. Recover the goal, decisions, constraints, acceptance criteria, and repository state. Do not ask the user to repeat information already recorded here. Continue from the current working tree without resetting or committing existing changes unless the user asks.
`;
}
