# HTML extraction

The ingest pipeline accepts saved HTML pages (e.g. portal "view statement" /
"portfolio summary" pages saved via browser **Save Page As → Webpage,
Complete**). Common cases:

- **Fidelity portfolio summary** — `Statements.html` saved from
  `digital.fidelity.com`. The associated `Statements_files/` asset folder is
  ignored on ingest; only the `.html` file is read.
- **Old Online Banking print views** that aren't downloadable as PDF.

## How extraction works

`scripts/ingest.py::_extract_html_text` strips `<script>` and `<style>` tags,
replaces block-level closes (`</tr>`, `</li>`, `</p>`, `</td>`, etc.) with
newlines so tabular content remains row-separated, strips remaining tags,
and unescapes HTML entities. The resulting plain text becomes a single page
in the `pages_text` list passed to the LLM extractor.

`source_format` on the resulting statement record is `"html"` so reports can
distinguish portal exports from issuer-mailed PDFs.

## What to do for new HTML sources

1. Drop the `.html` file into `inbox/<institution>/<period>.html`. The
   companion `*_files/` directory is fine to leave next to it; the parser
   ignores anything that isn't the HTML itself.
2. Run `scripts/ingest.py inbox/<institution>/<period>.html`.
3. If extraction is poor (e.g. the page is JS-rendered with no text
   actually in the DOM), the parser will return `"Not a recognizable
   statement"`. In that case the HTML is unusable as-is — the user has to
   re-export the page after the JS finishes rendering, or drop in the
   underlying PDF instead.

## Quirks

- Some institutions ship statements as HTML attachments in email; those
  often inline an entire JS bundle. The strip step removes scripts so they
  don't pollute the LLM prompt.
- Tables become a stream of newline-separated cells. The LLM is told to
  preserve description text verbatim, so column alignment loss is OK.
