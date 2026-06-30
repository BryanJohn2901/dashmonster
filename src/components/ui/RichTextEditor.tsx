"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";
import {
  Bold, Italic, UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Heading2, Heading3,
  Minus, RotateCcw,
} from "lucide-react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={[
        "flex h-7 w-7 items-center justify-center rounded transition-colors text-slate-600 dark:text-slate-300",
        active
          ? "bg-[#16A34A]/10 text-[#16A34A] dark:bg-[#22C55E]/15 dark:text-[#22C55E]"
          : "hover:bg-slate-100 dark:hover:bg-slate-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-600" />;
}

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: {},
        orderedList: {},
        horizontalRule: {},
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: placeholder ?? "Escreva aqui…",
        emptyEditorClass:
          "before:content-[attr(data-placeholder)] before:text-slate-300 dark:before:text-slate-500 before:pointer-events-none before:absolute before:top-0 before:left-0",
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "outline-none prose prose-sm dark:prose-invert max-w-none",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // treat empty doc as empty string
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Sync external value changes (e.g. TXT import)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (current !== incoming) {
      editor.commands.setContent(incoming || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const cmd = useCallback(
    (fn: () => void) => () => fn(),
    []
  );

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white transition focus-within:border-[#16A34A] focus-within:ring-2 focus-within:ring-[#16A34A]/15 dark:border-slate-600 dark:bg-slate-700 dark:focus-within:border-[#22C55E]">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
        {/* Text style */}
        <ToolbarButton
          title="Negrito (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={cmd(() => editor.chain().focus().toggleBold().run())}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Itálico (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={cmd(() => editor.chain().focus().toggleItalic().run())}
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Sublinhado (Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={cmd(() => editor.chain().focus().toggleUnderline().run())}
        >
          <UnderlineIcon size={14} />
        </ToolbarButton>

        <Divider />

        {/* Headings */}
        <ToolbarButton
          title="Subtítulo (H2)"
          active={editor.isActive("heading", { level: 2 })}
          onClick={cmd(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Título menor (H3)"
          active={editor.isActive("heading", { level: 3 })}
          onClick={cmd(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        >
          <Heading3 size={14} />
        </ToolbarButton>

        <Divider />

        {/* Lists */}
        <ToolbarButton
          title="Lista com marcadores"
          active={editor.isActive("bulletList")}
          onClick={cmd(() => editor.chain().focus().toggleBulletList().run())}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={cmd(() => editor.chain().focus().toggleOrderedList().run())}
        >
          <ListOrdered size={14} />
        </ToolbarButton>

        <Divider />

        {/* Align */}
        <ToolbarButton
          title="Alinhar à esquerda"
          active={editor.isActive({ textAlign: "left" })}
          onClick={cmd(() => editor.chain().focus().setTextAlign("left").run())}
        >
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Centralizar"
          active={editor.isActive({ textAlign: "center" })}
          onClick={cmd(() => editor.chain().focus().setTextAlign("center").run())}
        >
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Alinhar à direita"
          active={editor.isActive({ textAlign: "right" })}
          onClick={cmd(() => editor.chain().focus().setTextAlign("right").run())}
        >
          <AlignRight size={14} />
        </ToolbarButton>

        <Divider />

        {/* Misc */}
        <ToolbarButton
          title="Linha horizontal"
          active={false}
          onClick={cmd(() => editor.chain().focus().setHorizontalRule().run())}
        >
          <Minus size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Desfazer (Ctrl+Z)"
          active={false}
          onClick={cmd(() => editor.chain().focus().undo().run())}
        >
          <RotateCcw size={14} />
        </ToolbarButton>
      </div>

      {/* ── Editor area ── */}
      <EditorContent
        editor={editor}
        className="relative px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200"
        style={{ minHeight }}
      />
    </div>
  );
}
