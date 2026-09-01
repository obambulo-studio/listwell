export function mdcToMarkdown(source: string): string {
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---\n/, "");

  return withoutFrontmatter
    .replace(/::tech-detail\{summary="([^"]*)"\}([\s\S]*?)::/g, (_match, summary: string, body: string) => {
      return `### ${summary.trim()}\n\n${body.trim()}\n`;
    })
    .replace(/::impact\{[^}]*\}([\s\S]*?)::/g, (_match, body: string) => {
      return `> ${body.trim().replace(/\n+/g, "\n> ")}\n`;
    })
    .replace(/::fix-step\{number="(\d+)" title="([^"]*)"\}([\s\S]*?)::/g, (_match, number: string, title: string, body: string) => {
      return `### ${number}. ${title}\n\n${body.trim()}\n`;
    })
    .replace(/::time-estimate\{minutes="(\d+)" difficulty="([^"]*)"\}([\s\S]*?)::/g, (_match, minutes: string, difficulty: string, body: string) => {
      return `*About ${minutes} minutes. Difficulty: ${difficulty}.*\n\n${body.trim()}\n`;
    })
    .replace(/::example\{type="([^"]*)" title="([^"]*)"\}([\s\S]*?)::/g, (_match, _type: string, title: string, body: string) => {
      return `#### ${title}\n\n${body.trim()}\n`;
    })
    .replace(/::\w+\{[^}]*\}/g, "")
    .replace(/^::$/gm, "");
}
