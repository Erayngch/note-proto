import { useEffect } from "react";

const APP_TITLE = "ノート";

/**
 * Sync `document.title` with the current view.
 *
 * Pass the page-specific portion of the title (e.g. the note name). Pass
 * `null`/`undefined`/empty string to use the bare app title (e.g. while a note
 * is still loading or for a brand-new untitled note).
 *
 * The previous title is restored on unmount so transient views (e.g. an editor
 * mounted on top of the graph) do not leak their title back to the parent.
 */
export const useDocumentTitle = (pageTitle: string | null | undefined) => {
  useEffect(() => {
    const previous = document.title;
    document.title = pageTitle ? `${pageTitle} - ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = previous;
    };
  }, [pageTitle]);
};
