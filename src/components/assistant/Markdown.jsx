import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Assistant replies: GitHub-style Markdown (tables, lists, code), styled to
// match the app and safe on a phone (wide tables scroll inside their box).
const components = {
  h1: (props) => <h3 className="mb-2 mt-4 font-display text-lg font-semibold first:mt-0" {...props} />,
  h2: (props) => <h3 className="mb-2 mt-4 font-display text-base font-semibold first:mt-0" {...props} />,
  h3: (props) => <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0" {...props} />,
  h4: (props) => <h4 className="mb-1 mt-3 text-sm font-semibold first:mt-0" {...props} />,
  p: (props) => <p className="mb-3 last:mb-0" {...props} />,
  ul: (props) => <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0 marker:text-muted-foreground" {...props} />,
  ol: (props) => <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0 marker:text-muted-foreground" {...props} />,
  li: (props) => <li className="pl-1" {...props} />,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-primary underline underline-offset-2">{children}</a>,
  strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: (props) => <blockquote className="mb-3 border-l-2 border-primary/40 pl-3 text-muted-foreground" {...props} />,
  hr: () => <hr className="my-4 border-border" />,
  code: ({ className, children }) => {
    const block = /language-/.test(className || "") || String(children).includes("\n");
    return block
      ? <code className="block font-mono text-[12px]">{children}</code>
      : <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
  },
  pre: (props) => <pre className="mb-3 overflow-x-auto rounded-xl bg-muted px-3 py-2.5 last:mb-0" {...props} />,
  table: (props) => (
    <div className="mb-3 overflow-x-auto rounded-xl border border-border last:mb-0">
      <table className="w-full min-w-max border-collapse text-left text-[13px]" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/60" {...props} />,
  th: (props) => <th className="border-b border-border px-3 py-2 font-semibold" {...props} />,
  td: (props) => <td className="border-b border-border px-3 py-2 align-top [tr:last-child_&]:border-b-0" {...props} />,
};

export default function Markdown({ children }) {
  return (
    <div className="break-words text-sm leading-relaxed text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
    </div>
  );
}
