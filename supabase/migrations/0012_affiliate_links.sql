-- Migration 0012: affiliate_url on tools + outbound click tracking
-- affiliate_url is null when no affiliate program exists; falls back to website_url

ALTER TABLE public.tools ADD COLUMN affiliate_url text;

-- Track every outbound click for analytics + affiliate verification
CREATE TABLE public.outbound_clicks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id    uuid        NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  referrer   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outbound_clicks ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can record a click
CREATE POLICY "anyone_can_insert_clicks"
  ON public.outbound_clicks FOR INSERT
  WITH CHECK (true);

-- Only admins can read click analytics
CREATE POLICY "admins_can_read_clicks"
  ON public.outbound_clicks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
  );

CREATE INDEX outbound_clicks_tool_id_idx  ON public.outbound_clicks(tool_id);
CREATE INDEX outbound_clicks_created_at_idx ON public.outbound_clicks(created_at);
