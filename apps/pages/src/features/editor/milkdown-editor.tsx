import { useRef, useEffect } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type MilkdownEditorProps = {
  defaultValue: string;
  onChange: (markdown: string) => void;
};

// Japanese localization for Crepe's built-in UI strings.
// Crepe ships English defaults like "Please enter...", "Heading 1", "Paste link..."
// which clash with the surrounding Japanese UI; override them here.
const featureConfigs = {
  [Crepe.Feature.Placeholder]: {
    text: "本文を入力...",
    mode: "block" as const,
  },
  [Crepe.Feature.LinkTooltip]: {
    inputPlaceholder: "リンクを貼り付け...",
  },
  [Crepe.Feature.ImageBlock]: {
    inlineUploadButton: "アップロード",
    inlineUploadPlaceholderText: "またはリンクを貼り付け",
    blockUploadButton: "ファイルをアップロード",
    blockConfirmButton: "確定",
    blockCaptionPlaceholderText: "画像のキャプションを入力",
    blockUploadPlaceholderText: "またはリンクを貼り付け",
  },
  [Crepe.Feature.CodeMirror]: {
    searchPlaceholder: "言語を検索",
    copyText: "コピー",
    noResultText: "該当なし",
    previewToggleText: (previewOnlyMode: boolean) => (previewOnlyMode ? "編集" : "非表示"),
  },
  [Crepe.Feature.BlockEdit]: {
    textGroup: {
      label: "テキスト",
      text: { label: "テキスト" },
      h1: { label: "見出し1" },
      h2: { label: "見出し2" },
      h3: { label: "見出し3" },
      h4: { label: "見出し4" },
      h5: { label: "見出し5" },
      h6: { label: "見出し6" },
      quote: { label: "引用" },
      divider: { label: "区切り線" },
    },
    listGroup: {
      label: "リスト",
      bulletList: { label: "箇条書き" },
      orderedList: { label: "番号付きリスト" },
      taskList: { label: "タスクリスト" },
    },
    advancedGroup: {
      label: "高度",
      image: { label: "画像" },
      codeBlock: { label: "コードブロック" },
      table: { label: "表" },
      math: { label: "数式" },
    },
  },
};

export const MilkdownEditor = ({ defaultValue, onChange }: MilkdownEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue,
      featureConfigs,
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });

    void crepe.create();

    return () => {
      void crepe.destroy();
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="min-h-[300px]" />;
};
