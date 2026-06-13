-- Collections: curated SEO-optimised lists of tools
create table public.collections (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,             -- <title> tag
  h1               text not null,             -- page headline (can differ from title)
  description      text not null,             -- intro paragraph shown on page
  meta_description text,                      -- SEO meta description (≤160 chars)
  icon             text default '🤖',         -- emoji for listings page
  sort_order       int  default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Tools that belong to a collection, with ranking and an optional blurb
create table public.collection_tools (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  tool_id       uuid not null references public.tools(id) on delete cascade,
  rank          int  not null default 0,
  blurb         text,
  unique (collection_id, tool_id)
);

create index collection_tools_collection_rank_idx on public.collection_tools (collection_id, rank);

-- Anonymous submissions (no auth required)
create table public.tool_suggestions (
  id             uuid primary key default gen_random_uuid(),
  website_url    text not null,
  category_slug  text,
  contact_email  text,
  notes          text,
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected','duplicate')),
  created_at     timestamptz default now()
);

-- RLS
alter table public.collections      enable row level security;
alter table public.collection_tools enable row level security;
alter table public.tool_suggestions enable row level security;

create policy "collections_public_read"
  on public.collections for select using (true);

create policy "collection_tools_public_read"
  on public.collection_tools for select using (true);

-- Anyone can insert a suggestion; nobody can read/update/delete via client
create policy "suggestions_anon_insert"
  on public.tool_suggestions for insert with check (true);

-- ── Seed collections ──────────────────────────────────────────────────────────

insert into public.collections (slug, title, h1, description, meta_description, icon, sort_order) values
('best-free-ai-coding-tools',
 'Best Free AI Coding Tools in 2026',
 'Best Free AI Coding Tools (2026)',
 'The best AI coding assistants with a free tier — from inline autocomplete to full agentic editors. Ranked by developer adoption, language support, and quality of the free offering.',
 'Top free AI coding tools in 2026. Compare GitHub Copilot, Cursor, Codeium, Continue, Aider and more.',
 '💻', 1),

('top-ai-image-generators',
 'Top AI Image Generators in 2026',
 'Top AI Image Generators (2026)',
 'The best AI image generation tools ranked by output quality, speed, pricing, and commercial licensing. From photorealistic renders to artistic styles.',
 'Best AI image generators in 2026: Midjourney, DALL-E 3, Stable Diffusion, Ideogram, Flux and more.',
 '🎨', 2),

('best-ai-writing-assistants',
 'Best AI Writing Assistants in 2026',
 'Best AI Writing Assistants (2026)',
 'AI tools built specifically for writers, marketers, and content creators. Ranked by output quality, tone controls, long-form support, and value for money.',
 'Top AI writing tools in 2026: Jasper, Copy.ai, Writesonic, Grammarly, and more compared.',
 '✍️', 3),

('top-chatgpt-alternatives',
 'Best ChatGPT Alternatives in 2026',
 'Best ChatGPT Alternatives (2026)',
 'The strongest alternatives to ChatGPT — covering Claude, Gemini, Mistral, Grok, and open-source options. Each brings something different to the table.',
 'ChatGPT alternatives in 2026: Claude, Gemini, Grok, Mistral, Perplexity and more compared.',
 '🤖', 4),

('best-open-source-ai-tools',
 'Best Open Source AI Tools in 2026',
 'Best Open Source AI Tools (2026)',
 'Powerful AI tools you can self-host, fork, and customise. Ideal for developers who want control over their data and infrastructure.',
 'Best open source AI tools in 2026: Ollama, LocalAI, Stable Diffusion, LangChain, and more.',
 '🔓', 5),

('ai-tools-for-developers',
 'Best AI Tools for Developers in 2026',
 'Best AI Tools for Developers (2026)',
 'The essential AI toolkit for software engineers — covering code generation, documentation, testing, code review, and developer productivity.',
 'Best AI developer tools in 2026: Copilot, Cursor, Codeium, Tabnine, Sourcegraph and more.',
 '⚙️', 6),

('best-ai-video-generators',
 'Best AI Video Generators in 2026',
 'Best AI Video Generators (2026)',
 'Tools that create, edit, or enhance video using AI — from text-to-video to automated editing and avatar generation.',
 'Best AI video generation tools in 2026: Runway, Sora, Kling, Invideo, HeyGen and more.',
 '🎬', 7),

('free-ai-tools',
 'Best Free AI Tools in 2026',
 'Best Free AI Tools (2026)',
 'Genuinely useful AI tools with a free tier — no credit card required. Covering every category from writing to code to image generation.',
 'Best free AI tools in 2026 with no credit card required. Updated list across all categories.',
 '🆓', 8),

('best-ai-productivity-tools',
 'Best AI Productivity Tools in 2026',
 'Best AI Productivity Tools (2026)',
 'AI tools that save real time — covering note-taking, meeting summarisation, automation, scheduling, and workflow optimisation.',
 'Top AI productivity tools in 2026: Notion AI, Reclaim, Motion, Otter, Mem and more.',
 '⚡', 9),

('best-llm-api-providers',
 'Best LLM API Providers in 2026',
 'Best LLM API Providers (2026)',
 'The top API providers for accessing large language models in your own applications — ranked by model quality, latency, pricing, and developer experience.',
 'Best LLM API providers 2026: Anthropic, OpenAI, Groq, Together AI, Mistral API compared.',
 '🔌', 10),

('ai-tools-for-marketing',
 'Best AI Tools for Marketing in 2026',
 'Best AI Marketing Tools (2026)',
 'AI tools built for marketers — covering SEO, ad copy, social media, email, and campaign analytics.',
 'Best AI marketing tools in 2026: Jasper, Semrush AI, Surfer SEO, Copy.ai and more.',
 '📈', 11),

('best-ai-research-tools',
 'Best AI Research Tools in 2026',
 'Best AI Research Tools (2026)',
 'Tools that help you search smarter, synthesise information faster, and go deeper on any topic using AI.',
 'Best AI research tools 2026: Perplexity, Elicit, Consensus, Undermind, Semantic Scholar.',
 '🔍', 12),

('best-vector-databases',
 'Best Vector Databases in 2026',
 'Best Vector Databases (2026)',
 'Purpose-built databases for storing and querying embeddings at scale — the backbone of any modern RAG or semantic search application.',
 'Best vector databases 2026: Pinecone, Weaviate, Qdrant, Chroma, Milvus compared.',
 '🗃️', 13),

('best-ai-audio-tools',
 'Best AI Audio Tools in 2026',
 'Best AI Audio Tools (2026)',
 'AI tools for voice cloning, transcription, music generation, podcast editing, and audio enhancement.',
 'Best AI audio tools in 2026: ElevenLabs, Whisper, Suno, Udio, Descript and more.',
 '🎵', 14),

('best-ai-agent-frameworks',
 'Best AI Agent Frameworks in 2026',
 'Best AI Agent Frameworks (2026)',
 'Frameworks for building autonomous AI agents that can plan, use tools, and complete multi-step tasks with minimal human input.',
 'Best AI agent frameworks 2026: CrewAI, AutoGen, LangGraph, Pydantic AI, Agno compared.',
 '🤖', 15),

('best-ai-for-design',
 'Best AI Tools for Design in 2026',
 'Best AI Design Tools (2026)',
 'AI tools that help designers work faster — from UI generation to image editing, mockup creation, and design system automation.',
 'Best AI design tools 2026: Galileo AI, Figma AI, Adobe Firefly, Canva AI and more.',
 '🎨', 16),

('best-ai-customer-support-tools',
 'Best AI Customer Support Tools in 2026',
 'Best AI Customer Support Tools (2026)',
 'AI-powered chatbots, ticketing assistants, and support automation platforms that reduce response times and deflect repetitive queries.',
 'Best AI customer support tools 2026: Tidio, Intercom AI, Freshdesk AI, Zendesk AI.',
 '💬', 17),

('best-ai-data-analytics-tools',
 'Best AI Data Analytics Tools in 2026',
 'Best AI Data Analytics Tools (2026)',
 'AI tools that help you query, visualise, and derive insights from your data — without needing to write complex SQL or Python.',
 'Best AI data analytics tools 2026: Obviously AI, Polymer, Akkio, Julius and more.',
 '📊', 18),

('best-mlops-tools',
 'Best MLOps Tools in 2026',
 'Best MLOps & ML Training Platforms (2026)',
 'Tools for tracking experiments, managing datasets, orchestrating training pipelines, and monitoring models in production.',
 'Best MLOps tools 2026: Weights & Biases, MLflow, DVC, Neptune, ClearML compared.',
 '🧪', 19),

('best-ai-automation-tools',
 'Best AI Automation Tools in 2026',
 'Best AI Automation Tools (2026)',
 'Tools that let you automate workflows using AI — from no-code builders to powerful API-driven orchestration platforms.',
 'Best AI automation tools 2026: n8n, Make, Zapier AI, Activepieces, Lindy compared.',
 '🔄', 20);

-- ── Assign tools to collections based on category and attributes ───────────────
-- coding tools collection
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc, t.has_free_tier desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-free-ai-coding-tools'
  and t.status = 'published'
  and t.has_free_tier = true
  and cat.slug = 'coding-tools'
limit 15;

-- image generation collection
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'top-ai-image-generators'
  and t.status = 'published'
  and cat.slug = 'image-generation'
limit 15;

-- writing assistants
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-writing-assistants'
  and t.status = 'published'
  and cat.slug = 'writing-tools'
limit 15;

-- chatgpt alternatives — ai-assistants category
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'top-chatgpt-alternatives'
  and t.status = 'published'
  and cat.slug = 'ai-assistants'
limit 15;

-- open source tools
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
where c.slug = 'best-open-source-ai-tools'
  and t.status = 'published'
  and t.open_source = true
limit 15;

-- developer tools (coding + models-apis)
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'ai-tools-for-developers'
  and t.status = 'published'
  and cat.slug in ('coding-tools', 'models-apis')
limit 15;

-- video generators
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-video-generators'
  and t.status = 'published'
  and cat.slug = 'video-generation'
limit 15;

-- free tools (all categories, has_free_tier)
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
where c.slug = 'free-ai-tools'
  and t.status = 'published'
  and t.has_free_tier = true
limit 20;

-- productivity
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-productivity-tools'
  and t.status = 'published'
  and cat.slug = 'productivity'
limit 15;

-- LLM APIs
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-llm-api-providers'
  and t.status = 'published'
  and cat.slug = 'models-apis'
limit 15;

-- marketing
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'ai-tools-for-marketing'
  and t.status = 'published'
  and cat.slug in ('writing-tools', 'productivity')
  and (t.audience_fit = 'non_technical' or t.audience_fit = 'both')
limit 15;

-- research
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-research-tools'
  and t.status = 'published'
  and cat.slug = 'search-research'
limit 15;

-- vector databases
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-vector-databases'
  and t.status = 'published'
  and cat.slug = 'vector-databases'
limit 15;

-- audio
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-audio-tools'
  and t.status = 'published'
  and cat.slug = 'audio-tools'
limit 15;

-- agent frameworks
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-agent-frameworks'
  and t.status = 'published'
  and cat.slug = 'agent-frameworks'
limit 15;

-- design
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-for-design'
  and t.status = 'published'
  and cat.slug = 'image-generation'
  and t.audience_fit in ('non_technical', 'both')
limit 15;

-- customer support
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-customer-support-tools'
  and t.status = 'published'
  and cat.slug = 'customer-support'
limit 15;

-- data analytics
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-data-analytics-tools'
  and t.status = 'published'
  and cat.slug = 'data-analytics'
limit 15;

-- mlops
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-mlops-tools'
  and t.status = 'published'
  and cat.slug = 'mlops-training'
limit 15;

-- automation
insert into public.collection_tools (collection_id, tool_id, rank, blurb)
select c.id, t.id,
  row_number() over (partition by c.id order by t.popularity_score desc),
  null
from public.collections c
cross join public.tools t
join public.categories cat on cat.id = t.primary_category_id
where c.slug = 'best-ai-automation-tools'
  and t.status = 'published'
  and cat.slug = 'automation'
limit 15;
