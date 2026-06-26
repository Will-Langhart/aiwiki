insert into public.categories (slug, name, icon, sort_order) values
  ('productivity',        'Productivity',           'layout-dashboard', 150),
  ('customer-support',    'Customer support',       'headphones',       160),
  ('education',           'Education & learning',   'graduation-cap',   170),
  ('no-code',             'No-code & low-code',     'blocks',           180),
  ('security',            'AI security',            'shield',           190),
  ('legal',               'Legal & compliance',     'scale',            200),
  ('hr-recruiting',       'HR & recruiting',        'users',            210),
  ('finance',             'Finance & accounting',   'landmark',         220),
  ('healthcare',          'Healthcare & biotech',   'heart-pulse',      230)
on conflict (slug) do nothing;
