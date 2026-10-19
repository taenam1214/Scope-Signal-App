"""Shared parsing helpers."""

from __future__ import annotations

import re

from app.schemas import Chunk

# Soft cap so a single pathological paragraph can't produce a huge chunk.
MAX_CHUNK_CHARS = 4000


def chunk_text(text: str, *, locator_prefix: str = "paragraph") -> list[Chunk]:
    """Split text into paragraph chunks, preserving character offsets into `text`.

    Paragraphs are separated by one or more blank lines. Over-long paragraphs are
    split at MAX_CHUNK_CHARS. Offsets are absolute positions in the original text
    so evidence can be located precisely later.
    """
    chunks: list[Chunk] = []
    index = 0
    # Iterate over non-empty runs separated by blank lines, keeping offsets.
    for match in re.finditer(r"[^\n]+(?:\n[^\n]+)*", text):
        block = match.group().strip()
        if not block:
            continue
        base_start = match.start()
        for offset in range(0, len(block), MAX_CHUNK_CHARS):
            piece = block[offset : offset + MAX_CHUNK_CHARS]
            start = base_start + offset
            chunks.append(
                Chunk(
                    chunk_index=index,
                    text=piece,
                    source_locator=f"{locator_prefix} {index + 1}",
                    character_start=start,
                    character_end=start + len(piece),
                )
            )
            index += 1
    return chunks


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\r\f\v]+")


def strip_html(html: str) -> str:
    """Best-effort HTML -> text for extraction. Removes script/style and tags.

    This is NOT a sanitizer for rendering; it only extracts readable text. No
    external resources are fetched and no markup is executed.
    """
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>", "\n", html)
    html = re.sub(r"(?i)</p>", "\n\n", html)
    text = _TAG_RE.sub(" ", html)
    # Collapse HTML entities we care about minimally.
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    text = _WS_RE.sub(" ", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip()
