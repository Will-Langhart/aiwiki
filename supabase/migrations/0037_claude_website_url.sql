-- Claude's website: claude.ai → claude.com
--
-- claude.ai is the app and sits behind a Cloudflare challenge, so every refresh
-- failed (HTTP 403). claude.com is Anthropic's product site for Claude — plans
-- and pricing at claude.com/pricing — and serves plain HTML. Data-only.

update public.tools
set website_url = 'https://claude.com', updated_at = now()
where slug = 'claude'
  and website_url is distinct from 'https://claude.com';
