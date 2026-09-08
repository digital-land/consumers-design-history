# Images for "Testing design history"

Add screenshots for this post here, then reference them from
`app/posts/2026-09-08-testing-design-history.md`.

## How to add images

1. Drag and drop your image files into this folder (you can do this
   directly on GitHub: open this folder on the post's branch, then use
   **Add file > Upload files**).
2. Name each file with a two-digit number prefix showing the order it
   should appear in, e.g. `01-original-page.png`, `02-new-design.png`.
3. For each image, copy this into the `screenshots.items` list in the
   post's front matter, then fill in the placeholders:

   ```yaml
   - text: Describe this screenshot
     src: 02-your-image.png
     alt: Describe what this screenshot shows, for people using a screen reader
     caption: A caption shown underneath the screenshot
   ```

4. Reference the image from the post body too, e.g.
   `![Alt text](/testing-design-history/02-your-image.png)`.
5. Delete this README once the post is ready, and mark the pull request
   ready for review.

See [CLAUDE.md](../../../CLAUDE.md) for more on the post format.
