"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function textOfChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOfChildren).join("");
  if (children && typeof children === "object" && "props" in (children as any)) {
    return textOfChildren((children as any).props.children);
  }
  return "";
}

export function HelpDoc({ md }: { md: string }) {
  return (
    <div className="prose prose-slate max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-6 mt-2">{children}</h1>
          ),
          h2: ({ children }) => {
            const id = slugify(textOfChildren(children));
            return (
              <h2 id={id} className="text-2xl font-bold text-slate-900 mt-10 mb-4 pb-2 border-b border-slate-200 scroll-mt-6">
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const id = slugify(textOfChildren(children));
            return (
              <h3 id={id} className="text-lg font-semibold text-slate-900 mt-6 mb-2 scroll-mt-6">
                {children}
              </h3>
            );
          },
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-slate-900 mt-4 mb-2">{children}</h4>
          ),
          p: ({ children }) => <p className="text-sm text-slate-700 leading-relaxed mb-3">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-3 text-sm text-slate-700">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-3 text-sm text-slate-700">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children, className }) => {
            const isBlock = !!className;
            if (isBlock) {
              return (
                <code className="block bg-slate-900 text-slate-100 text-xs font-mono p-3 rounded-lg whitespace-pre overflow-auto">
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-slate-100 text-slate-800 text-[12px] font-mono px-1.5 py-0.5 rounded">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-3">{children}</pre>,
          table: ({ children }) => (
            <div className="my-4 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
          th: ({ children }) => <th className="text-left font-semibold text-slate-700 px-3 py-2 border-b border-slate-200">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 border-b border-slate-100 align-top">{children}</td>,
          a: ({ href, children }) => (
            <a href={href} className="text-brand-700 hover:underline" target={href?.startsWith("http") ? "_blank" : undefined} rel="noopener">
              {children}
            </a>
          ),
          hr: () => <hr className="my-8 border-slate-200" />,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-brand-300 bg-brand-50 px-4 py-2 my-3 text-sm text-slate-700">
              {children}
            </blockquote>
          ),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}
