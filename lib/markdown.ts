export const mdcToMarkdown = (source: string): string => {
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---\n/u, "");

  return withoutFrontmatter
    .replaceAll(
      /::tech-detail\{summary="(?<summary>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, summary: string, body: string) =>
        `### ${summary.trim()}\n\n${body.trim()}\n`
    )
    .replaceAll(
      /::impact\{[^}]*\}(?<body>[\s\S]*?)::/gu,
      (_match, body: string) => `> ${body.trim().replaceAll(/\n+/gu, "\n> ")}\n`
    )
    .replaceAll(
      /::fix-step\{number="(?<number>\d+)" title="(?<title>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, number: string, title: string, body: string) =>
        `### ${number}. ${title}\n\n${body.trim()}\n`
    )
    .replaceAll(
      /::time-estimate\{minutes="(?<minutes>\d+)" difficulty="(?<difficulty>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, minutes: string, difficulty: string, body: string) =>
        `*About ${minutes} minutes. Difficulty: ${difficulty}.*\n\n${body.trim()}\n`
    )
    .replaceAll(
      /::example\{type="[^"]*" title="(?<title>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, title: string, body: string) =>
        `#### ${title}\n\n${body.trim()}\n`
    )
    .replaceAll(/::\w+\{[^}]*\}/gu, "")
    .replaceAll(/^::$/gmu, "");
};
