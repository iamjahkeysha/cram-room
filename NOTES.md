# Cram Room – build notes

## Bug I caught by reviewing output
First version let Claude choose the correct answer's position. Reading all 8 generated questions, I found 4 had the wrong option marked, even though each explanation and quote were correct. Fix: Claude now returns the correct answer and wrong answers separately; the server shuffles them and records the index, so the marked answer can't drift. Also added a check that the quote contains the answer's key words. Result on the same article: 8/8 correct, 0 dropped, 8.9s.

## Other things I verified
- Tested firecrawl/scrape and anthropic/chat-completion from the CLI before writing code, to see the real response shapes. Scrape cost $0.0038.
- Found the raw scraped Markdown was full of links, images and citation markers, which would break quote matching. Added a cleaning step and cut the References section.
- Chose Claude Haiku for cost and speed (users wait in a lobby while questions generate).
