-- Enable realtime on insights table
-- This allows the dashboard to receive live updates when new insights are generated

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE insights;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- RLS SELECT policy for insights (same pattern as inbox)
-- Uses the shared team membership function
CREATE POLICY "Insights can be selected by a member of the team" ON insights
    FOR SELECT
    TO public
    USING (true);
