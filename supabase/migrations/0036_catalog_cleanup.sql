-- Catalog cleanup from the first freshness report (2026-10-08)
--
-- Data-only. Nothing is deleted: duplicates and defunct tools move to
-- status='archived' (reversible — set it back to 'published'), which drops them
-- from the directory, search, chat retrieval, alternatives, compare pairs,
-- prerender and the sitemap. vercel.json 301-redirects every archived slug.
--
-- No archived tool has bookmarks, ratings, claims or screenshots, so there is
-- nothing to move onto the kept listing. Re-running is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Duplicates → archive the extra listing, keep the canonical one.
--    Kept: higher popularity, then verified data, then shorter slug.
-- ---------------------------------------------------------------------------
update public.tools t
set status = 'archived', updated_at = now()
from (values
  ('amazon-q',                      'amazon-q-developer'),
  ('cody-by-sourcegraph',           'cody'),
  ('continue',                      'continue-dev'),
  ('google-gemini',                 'gemini'),
  ('jenni',                         'jenni-ai'),
  ('kling',                         'kling-ai'),
  ('mistral-le-chat',               'le-chat'),
  ('nice',                          'nice-cxone'),        -- the product, not the company
  ('replit',                        'replit-ai'),
  ('semrush',                       'semrush-ai'),
  ('timeos-timeless',               'timeos'),
  ('ultimate-ai-zendesk-ai-agents', 'zendesk-ai-agents-formerly-ultimate-ai'),
  ('v0-by-vercel',                  'v0'),
  ('weights-biases',                'weights-and-biases'),
  ('zapier-ai',                     'zapier'),
  ('codeium',                       'windsurf'),          -- Codeium renamed to Windsurf
  ('windsurf-devin-desktop',        'windsurf'),
  ('comet-opik',                    'opik')               -- no content blocks; opik has them
) as d(dup, keep)
where t.slug = d.dup
  and t.status = 'published'
  and exists (select 1 from public.tools k where k.slug = d.keep and k.status = 'published');

-- ---------------------------------------------------------------------------
-- 2. Defunct → archive.
-- ---------------------------------------------------------------------------
update public.tools
set status = 'archived', updated_at = now()
where status = 'published'
  and slug in (
    'play-ht',             -- play.ht no longer resolves (DNS)
    'sweep',               -- sweep.dev no longer resolves (DNS)
    'tome',                -- tome.app returns 404
    'mutable-ai',          -- mutableai.com is a domain-for-sale page (atom.com)
    'magician',            -- magician.design lapsed; redirects to an unrelated business
    'magician-for-figma',
    'neptune-ai'           -- neptune.ai TLS certificate expired
  );

-- ---------------------------------------------------------------------------
-- 3. Website URLs that moved (final URL after redirects, checked 2026-10-08).
-- ---------------------------------------------------------------------------
update public.tools t
set website_url = u.url, updated_at = now()
from (values
  ('ada',                                    'https://www.ada.cx'),
  ('chatgpt',                                'https://chatgpt.com'),
  ('cursor',                                 'https://cursor.com'),
  ('factory',                                'https://factory.com'),
  ('fathom',                                 'https://www.fathom.ai'),
  ('flux',                                   'https://bfl.ai'),
  ('gladly',                                 'https://www.gladly.ai'),
  ('greenhouse',                             'https://www.greenhouse.com'),
  ('kling-ai',                               'https://kling.ai'),
  ('livekit',                                'https://livekit.com'),
  ('modernloop',                             'https://www.modernloop.com'),
  ('notion',                                 'https://www.notion.com'),
  ('notion-ai',                              'https://www.notion.com/product/ai'),
  ('ollama',                                 'https://ollama.com'),
  ('opusclip',                               'https://www.opus.pro'),
  ('pi',                                     'https://pi.ai'),
  ('relume',                                 'https://www.relume.ai'),
  ('runway',                                 'https://runway.com'),
  ('spellbook',                              'https://spellbook.com'),
  ('stack-ai',                               'https://www.stackai.com'),
  ('typebot',                                'https://typebot.com'),
  ('v0',                                     'https://v0.app'),
  ('vercel-ai-sdk',                          'https://ai-sdk.dev'),
  ('vizcom',                                 'https://vizcom.com'),
  ('wellsaid-labs',                          'https://www.wellsaid.io'),
  ('windsurf',                               'https://devin.ai/desktop'),
  ('zendesk-ai-agents-formerly-ultimate-ai', 'https://www.zendesk.com/service/ai/ai-agents/'),
  ('nvidia-dgx-cloud-lepton',                'https://www.nvidia.com/en-us/data-center/dgx-cloud-lepton/'),
  ('wondershare-filmora',                    'https://filmora.wondershare.com')
) as u(slug, url)
where t.slug = u.slug
  and t.website_url is distinct from u.url;
